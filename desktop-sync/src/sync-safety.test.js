import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDeletionQueue } from './deletion-queue';
import { safeRelative, safeLocalPath } from './sync-safety';
import { generateManifestEntries } from './placeholder-sync';
import { decideUploadAction } from './upload-watcher';

describe('durable local deletion', () => {
  it('survives a restart and retries a failed deletion without a filesystem event', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gescon-test-'));
    const journalPath = path.join(root, 'journal.json');
    let calls = 0;
    const apiClient = { deleteFolder: async () => { if (++calls === 1) throw Error('offline'); } };
    const opts = { journalPath, apiClient, onLog() {}, onDeleted() {} };
    const first = createDeletionQueue(opts);
    first.enqueue('Documents', 'folder', true);
    await first.drain(); first.stop();
    const second = createDeletionQueue(opts);
    expect(second.contains('Documents/child.txt')).toBe(true);
    await second.retry();
    expect(calls).toBe(2);
    expect(second.list()).toEqual([]);
    fs.rmSync(root, { recursive: true });
  });
  it('coalesces children into one parent operation and retains more than five deletions', async () => {
    const calls = [];
    const queue = createDeletionQueue({ apiClient: { deleteFolder: async id => calls.push(id), deleteFile: async id => calls.push(id) }, onLog() {}, onDeleted() {} });
    queue.enqueue('a/child.txt', 'child', false);
    queue.enqueue('a', 'parent', true);
    queue.enqueue('a/other.txt', 'other', false);
    for (let i=0; i<6; i++) queue.enqueue('folder'+i, 'id'+i, true);
    await queue.retry();
    expect(calls).toHaveLength(7);
    expect(calls).not.toContain('child');
    expect(queue.list()).toEqual([]);
  });
});

describe('sync boundaries', () => {
  it.each(['../outside', '..\\outside', 'C:\\outside', '/absolute', 'a//b', 'a/CON.txt', 'a/file:stream', 'a/trailing.', 'a/trailing '])('rejects %s', key => {
    expect(() => safeRelative(key)).toThrow();
  });
  it('refuses junctions pointing outside the selected root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gescon-link-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gescon-outside-'));
    try {
      fs.symlinkSync(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
      expect(() => safeLocalPath(root, 'link/file.txt')).toThrow();
    } finally { fs.rmSync(root, { recursive: true }); fs.rmSync(outside, { recursive: true }); }
  });
  it('rejects cycles but preserves both IDs in case-insensitive collisions', async () => {
    await expect(generateManifestEntries({ getFullTree: async () => ({ folders: [{id:'a', parentId:'b',name:'A'},{id:'b',parentId:'a',name:'B'}], files:[] }) })).rejects.toThrow('Ciclo');
    const entries = await generateManifestEntries({ getFullTree: async () => ({ folders: [{id:'a',name:'A'},{id:'b',name:'a'}], files:[] }) });
    expect(new Set(entries.map(e => e.relativePath.toLowerCase())).size).toBe(2);
    expect(entries.map(e => e.folderId).sort()).toEqual(['a','b']);
  });
  it('detects equal-size edits and simultaneous remote edits', () => {
    expect(decideUploadAction(4, {fileId:'f',fileSize:4,updatedAt:'v1'},'v1',true).action).toBe('update');
    expect(decideUploadAction(4, {fileId:'f',fileSize:4,updatedAt:'v2'},'v1',true).action).toBe('conflict');
  });
});
