import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStartupRunner } from './startup-runner';
import { generateManifestEntries } from './placeholder-sync';

afterEach(() => vi.useRealTimers());
describe('automatic startup', () => {
  it('retries a failed initialization without opening the folder picker', async () => {
    vi.useFakeTimers();
    const start = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(true);
    const onError = vi.fn();
    const runner = createStartupRunner({ start, onError, shouldRetry: () => true });
    await runner.run();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }), true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(start).toHaveBeenCalledTimes(2);
    runner.cancel();
  });
  it('does not overlap attempts and cancels retries on disconnect', async () => {
    vi.useFakeTimers();
    let reject;
    const start = vi.fn(() => new Promise((_, r) => { reject = r; }));
    const onError = vi.fn();
    const runner = createStartupRunner({ start, onError, shouldRetry: () => true });
    const first = runner.run();
    expect(runner.run()).toBe(first);
    await Promise.resolve();
    runner.cancel();
    reject(Error('offline'));
    await first;
    await vi.advanceTimersByTimeAsync(60000);
    expect(start).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
  it('does not retry rejected authentication', async () => {
    vi.useFakeTimers();
    const start = vi.fn().mockRejectedValue({ status: 401 });
    const runner = createStartupRunner({ start, onError() {}, shouldRetry: () => false });
    await runner.run();
    await vi.advanceTimersByTimeAsync(60000);
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('includes all root folders, nested folders and files with no selection', async () => {
    const entries = await generateManifestEntries({ getFullTree: async () => ({
      folders: [{id:'a',name:'A'}, {id:'b',name:'B'}, {id:'c',name:'C',parentId:'a'}],
      files: [{id:'1',name:'root.txt'}, {id:'2',name:'nested.txt',folderId:'c'}, {id:'3',name:'b.txt',folderId:'b'}],
    }) });
    expect(entries.map(e => e.relativePath)).toEqual(['A','B','A\\C','root.txt','A\\C\\nested.txt','B\\b.txt']);
    expect(entries.excludedPaths).toEqual([]);
  });
});
