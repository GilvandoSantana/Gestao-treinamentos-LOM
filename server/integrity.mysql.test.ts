import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import mysqldump from 'mysqldump';
import { getDb } from './db';
import { warehouseItems, warehouseMovements, toolDeliveries, pendingSignups, organizations, admins, completedSignups, cloudFiles, cloudStorageConfig } from '../drizzle/schema';
import { createWarehouseMovement, getWarehouseItemById, updateWarehouseItem } from './db-warehouse';
import { createToolDelivery, returnToolDelivery } from './db-tool-deliveries';
import { finalizePaidSignup, ensureIntegrityTables } from './db-organizations';
import { createFileRecord, getStorageInfo, recalculateStorageUsed, uploadNewVersion, reserveStorageCapacity, releaseStorageReservation } from './db-cloud';

// Only the CI-owned disposable MySQL database may run these write tests.
describe.runIf(process.env.RUN_DB_INTEGRATION === '1')('MySQL integrity and backup compatibility', () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('/integrity_test')) throw new Error('Expected isolated integrity_test database');
    db = (await getDb())!;
    await ensureIntegrityTables();
  });
  async function item(quantity = 10) {
    const id = randomUUID(), contract = randomUUID();
    await db.insert(warehouseItems).values({ id, contract, code: id, name: 'Synthetic stock', type: 'ferramenta', unit: 'un', quantity: String(quantity) });
    return { id, contract };
  }
  it('does not oversell when two withdrawals race', async () => {
    const i = await item();
    const outcomes = await Promise.allSettled([1, 2].map(() => createWarehouseMovement(randomUUID(), i.contract, { itemId: i.id, quantity: 6, movementType: 'saida' })));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect((await getWarehouseItemById(i.id))?.quantity).toBe(4);
    expect(await db.select().from(warehouseMovements).where(eq(warehouseMovements.itemId, i.id))).toHaveLength(1);
  });
  it('rolls back the movement if the stock update fails', async () => {
    const i = await item();
    await db.execute(sql`CREATE TRIGGER fail_stock BEFORE UPDATE ON warehouseItems FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected stock failure'`);
    try {
      await expect(createWarehouseMovement(randomUUID(), i.contract, { itemId: i.id, quantity: 2, movementType: 'entrada' })).rejects.toThrow();
    } finally { await db.execute(sql`DROP TRIGGER fail_stock`); }
    expect((await getWarehouseItemById(i.id))?.quantity).toBe(10);
    expect(await db.select().from(warehouseMovements).where(eq(warehouseMovements.itemId, i.id))).toHaveLength(0);
  });
  it('credits a delivery return exactly once under concurrency', async () => {
    const i = await item();
    const delivery = await createToolDelivery(randomUUID(), i.contract, { employeeId: randomUUID(), employeeName: 'Synthetic', itemId: i.id, quantity: 3 });
    const outcomes = await Promise.allSettled([1, 2].map(() => returnToolDelivery(delivery.id, i.contract)));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect((await getWarehouseItemById(i.id))?.quantity).toBe(10);
  });
  it('does not let a stale item edit overwrite stock', async () => {
    const i = await item();
    await createWarehouseMovement(randomUUID(), i.contract, { itemId: i.id, quantity: 3, movementType: 'saida' });
    await updateWarehouseItem(i.id, i.contract, { code: i.id, name: 'Edited', type: 'ferramenta', unit: 'un', quantity: 10, estoqueMinimo: 0, precoUnitario: 0 });
    expect((await getWarehouseItemById(i.id))?.quantity).toBe(7);
  });
  it('finalizes concurrent payment callbacks once and recovers later returns', async () => {
    const id = randomUUID(), slug = randomUUID(), username = randomUUID();
    await db.insert(pendingSignups).values({ id, organizationName: 'Synthetic organization', organizationSlug: slug, adminUsername: username, passwordHash: 'test-hash', email: 'test@example.invalid', token: randomUUID(), expiresAt: new Date(Date.now() + 60000) });
    const stripe = { checkoutSessionId: randomUUID(), customerId: randomUUID(), subscriptionId: randomUUID(), subscriptionStatus: 'active' };
    const [first, second] = await Promise.all([finalizePaidSignup(id, stripe), finalizePaidSignup(id, stripe)]);
    expect(first?.organization.id).toBe(second?.organization.id);
    expect((await finalizePaidSignup(id, stripe))?.admin.id).toBe(first?.admin.id);
    expect(await db.select().from(organizations).where(eq(organizations.slug, slug))).toHaveLength(1);
    expect(await db.select().from(pendingSignups).where(eq(pendingSignups.id, id))).toHaveLength(0);
    expect(await db.select().from(completedSignups).where(eq(completedSignups.pendingSignupId, id))).toHaveLength(1);
    await expect(finalizePaidSignup(id, { ...stripe, checkoutSessionId: 'another-session' })).rejects.toThrow();
  });
  it('rolls back organization and owner creation if the receipt insert fails', async () => {
    const id = randomUUID(), slug = randomUUID();
    await db.insert(pendingSignups).values({ id, organizationName: 'Synthetic', organizationSlug: slug, adminUsername: randomUUID(), passwordHash: 'test', email: 'test@example.invalid', token: randomUUID(), expiresAt: new Date(Date.now() + 60000) });
    // A duplicate checkout receipt fails after organization and owner insertion.
    const session = randomUUID();
    await db.insert(completedSignups).values({ pendingSignupId: randomUUID(), checkoutSessionId: session, organizationId: 'other', adminId: 'other', customerId: 'other', subscriptionId: 'other' });
    await expect(finalizePaidSignup(id, { checkoutSessionId: session, customerId: 'test', subscriptionId: 'test', subscriptionStatus: 'active' })).rejects.toThrow();
    expect(await db.select().from(organizations).where(eq(organizations.slug, slug))).toHaveLength(0);
    expect(await db.select().from(pendingSignups).where(eq(pendingSignups.id, id))).toHaveLength(1);
  });
  it('atomically enforces capacity when file commits race', async () => {
    const contract = randomUUID();
    await db.insert(cloudStorageConfig).values({ contractSlug: contract, limitBytes: 100, usedBytes: 0 });
    const outcomes = await Promise.allSettled([1, 2].map(() => createFileRecord({ id: randomUUID(), contractSlug: contract, folderId: null, name: 'Synthetic', fileSize: 60, mimeType: 'text/plain', uploadedBy: 'test' })));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect((await getStorageInfo(contract)).usedBytes).toBe(60);
    expect(await db.select().from(cloudFiles).where(eq(cloudFiles.contractSlug, contract))).toHaveLength(1);
  });
  it('reserves capacity atomically and releases it after failed uploads', async () => {
    const contract = randomUUID(), ids = [randomUUID(), randomUUID()];
    await db.insert(cloudStorageConfig).values({ contractSlug: contract, limitBytes: 100, usedBytes: 0 });
    const outcomes = await Promise.allSettled(ids.map(id => reserveStorageCapacity(contract, 60, id)));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    const winner = ids[outcomes.findIndex(o => o.status === 'fulfilled')];
    await releaseStorageReservation(winner);
    const reservationId = randomUUID();
    await reserveStorageCapacity(contract, 60, reservationId);
    await createFileRecord({ id: randomUUID(), contractSlug: contract, folderId: null, name: 'Reserved', fileSize: 60, reservationId, mimeType: 'text/plain', uploadedBy: 'test' });
    expect((await getStorageInfo(contract)).usedBytes).toBe(60);
    await reserveStorageCapacity(contract, 40, randomUUID());
    await expect(reserveStorageCapacity(contract, 1, randomUUID())).rejects.toThrow('armazenamento');
  });
  it('accounts for retained versions and trash when recalculating quota', async () => {
    const contract = randomUUID(), id = randomUUID();
    await db.insert(cloudStorageConfig).values({ contractSlug: contract, limitBytes: 100, usedBytes: 0 });
    await createFileRecord({ id, contractSlug: contract, folderId: null, name: 'Synthetic', fileSize: 40, mimeType: 'text/plain', uploadedBy: 'test' });
    await uploadNewVersion(randomUUID(), id, contract, { fileSize: 50, mimeType: 'text/plain', uploadedBy: 'test' });
    await db.update(cloudFiles).set({ deletedAt: new Date() }).where(eq(cloudFiles.id, id));
    expect(await recalculateStorageUsed(contract)).toBe(90);
    await expect(createFileRecord({ id: randomUUID(), contractSlug: contract, folderId: null, name: 'Too large', fileSize: 11, mimeType: 'text/plain', uploadedBy: 'test' })).rejects.toThrow('armazenamento');
  });
  it('creates and restores a SQL backup with the patched mysql2 driver', async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const connection = { host: url.hostname, port: Number(url.port) || 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: 'integrity_test' };
    const source = await mysql.createConnection(connection);
    await source.query('CREATE TABLE IF NOT EXISTS backup_probe (id INT PRIMARY KEY, value TEXT)');
    await source.query('INSERT INTO backup_probe VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [1, "Synthetic 'quoted' café"]);
    const dump = await mysqldump({ connection, dump: { tables: ['backup_probe'] } });
    await source.query('CREATE DATABASE IF NOT EXISTS integrity_test_restore');
    const restore = await mysql.createConnection({ ...connection, database: 'integrity_test_restore', multipleStatements: true });
    try {
      await restore.query([dump.dump.schema, dump.dump.data].filter(Boolean).join('\n'));
      const [rows] = await restore.query('SELECT value FROM backup_probe WHERE id = 1');
      expect((rows as any[])[0].value).toBe("Synthetic 'quoted' café");
    } finally { await restore.end(); await source.end(); }
  }, 30000);
});
