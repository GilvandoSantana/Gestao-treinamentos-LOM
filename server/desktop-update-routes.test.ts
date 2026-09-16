import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { registerDesktopUpdateRoutes } from './desktop-update-routes';
const fixture = vi.hoisted(() => ({ authorized: true, installer: null as any }));
vi.mock('./_core/context', () => ({ createContext: async () => ({ isSiteAdmin: fixture.authorized }) }));
vi.mock('./db-desktop-installer', () => ({ getCurrentInstaller: async () => fixture.installer }));
vi.mock('./r2-storage', () => ({ getR2DownloadUrl: vi.fn() }));
const servers: ReturnType<ReturnType<typeof express>['listen']>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve())))); });
async function request(asset = 'latest.yml') {
  const app = express(); registerDesktopUpdateRoutes(app);
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  return fetch(`http://127.0.0.1:${address.port}/api/desktop-update/${asset}`);
}
describe('authenticated installer feed', () => {
  it('does not expose update metadata without an authenticated session', async () => {
    fixture.authorized = false;
    expect((await request()).status).toBe(401);
  });
  it('does not announce unverified legacy installers', async () => {
    fixture.authorized = true; fixture.installer = { version:'1.0.0' };
    expect((await request()).status).toBe(404);
  });
  it('announces the verified checksum and keeps downloads on the authenticated origin', async () => {
    fixture.authorized = true;
    fixture.installer = { version:'1.1.0', sha512:'verified-digest', fileSize:123, uploadedAt:new Date('2026-09-16T00:00:00Z') };
    const response = await request();
    const metadata = await response.json();
    expect(metadata.files[0]).toEqual({url:'installer.exe?version=1.1.0',sha512:'verified-digest',size:123});
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await request('installer.exe?version=1.0.0')).status).toBe(404);
  });
});
