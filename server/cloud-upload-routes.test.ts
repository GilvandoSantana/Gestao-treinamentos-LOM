import express from 'express';
import { createServer, type Server } from 'node:http';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn(), version: vi.fn(), head: vi.fn(), complete: vi.fn(), remove: vi.fn(), part: vi.fn(), abort: vi.fn() }));
vi.mock('./_core/context', () => ({ createContext: async ({ req }: any) => ({ isSiteAdmin: true, siteAdminUsername: req.headers['x-test-user'] ?? 'owner', siteRole: 'admin', siteContract: 'contract' }) }));
vi.mock('./db-cloud', () => ({ reserveStorageCapacity: vi.fn(), releaseStorageReservation: vi.fn(async () => {}), canAccessFile: m.access, canAccessFolder: m.access, createFileRecord: m.create, uploadNewVersion: m.version, getStorageInfo: async () => ({ usedBytes: 0, limitBytes: 1000 }), getFileById: async () => ({ id: 'file', contractSlug: 'contract', folderId: null }), isLockActive: () => false }));
vi.mock('./r2-storage', () => ({ isR2Configured: true, createMultipartUpload: async () => 'upload', abortMultipartUpload: m.abort, completeMultipartUpload: m.complete, getObjectSize: m.head, uploadPartToR2: m.part, deleteFromR2: m.remove }));
vi.mock('./db-activity', () => ({ logActivity: vi.fn() }));
import { registerCloudUploadRoutes, measuredParts, validateDeclaredSize } from './cloud-upload-routes';
let server: Server, url: string;
beforeEach(async () => {
  vi.resetAllMocks(); m.access.mockResolvedValue(true); m.head.mockResolvedValue(4); m.part.mockResolvedValue('server-etag'); m.create.mockResolvedValue({ id: 'file', name: 'Synthetic' });
  const app = express(); app.use(express.json()); registerCloudUploadRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const post = (path: string, body: unknown, user = 'owner') => fetch(url + '/api/cloud-upload/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, 'x-test-user': user }, body: JSON.stringify(body) });
const part = (user = 'owner') => fetch(url + '/api/cloud-upload/part?uploadId=upload&partNumber=1', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Origin: url, 'x-test-user': user }, body: 'test' });
async function start(folderId: string | null = null) { return post('start', { name: 'Synthetic', fileName: 'test.txt', fileSize: 4, folderId }); }
it.each([-1, 0, 1.5, '4', Number.NaN])('rejects invalid declared size %s', value => { expect(() => validateDeclaredSize(value)).toThrow(); });
it('does not trust the client size or ETags on completion', async () => {
  expect((await start()).status).toBe(200); expect((await part()).status).toBe(200);
  expect((await post('complete', { uploadId: 'upload', fileSize: 0, parts: [{ partNumber: 99, etag: 'forged' }] })).status).toBe(200);
  expect(m.complete).toHaveBeenCalledWith(expect.any(String), 'upload', [{ partNumber: 1, etag: 'server-etag' }]);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ fileSize: 4 }));
});
it('counts a retried part only once', async () => {
  await start(); await part(); await part();
  expect((await post('complete', { uploadId: 'upload' })).status).toBe(200);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ fileSize: 4 }));
});
it('blocks another user of the same contract from hijacking an upload', async () => {
  await start(); expect((await part('other-user')).status).toBe(400);
  expect((await post('complete', { uploadId: 'upload' }, 'other-user')).status).toBe(400);
  expect(m.part).not.toHaveBeenCalled(); expect(m.complete).not.toHaveBeenCalled();
});
it('checks folder access again before completing the upload', async () => {
  await start('folder'); await part(); m.access.mockResolvedValue(false);
  expect((await post('complete', { uploadId: 'upload' })).status).toBe(400);
  expect(m.create).not.toHaveBeenCalled();
});
it('removes the object if its stored size disagrees with received bytes', async () => {
  await start(); await part(); m.head.mockResolvedValue(5);
  expect((await post('complete', { uploadId: 'upload' })).status).toBe(400);
  expect(m.remove).toHaveBeenCalledOnce(); expect(m.create).not.toHaveBeenCalled();
});
it('removes the object if the atomic capacity check fails', async () => {
  await start(); await part(); m.create.mockRejectedValue(new Error('Espaço insuficiente'));
  expect((await post('complete', { uploadId: 'upload' })).status).toBe(400); expect(m.remove).toHaveBeenCalledOnce();
});
it('rejects missing parts', () => {
  expect(() => measuredParts(new Map([[2, { etag: 'etag', size: 4 }]]), 4)).toThrow();
});
