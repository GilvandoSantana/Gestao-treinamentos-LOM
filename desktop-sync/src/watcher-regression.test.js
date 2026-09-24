import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('./upload-watcher.js', import.meta.url), 'utf8');
function harness({ folders, files } = {}) {
  let event;
  const timers = new Map(), intervals = [];
  folders = folders ?? new Map([['docs', 'folder-id']]);
  files = files ?? new Map();
  const disk = new Set();
  const calls = [], logs = [], root = 'C:\\isolated-sync-test';
  const stat = full => {
    if (full !== root && !disk.has(full)) throw Object.assign(Error('absent'), {code:'ENOENT'});
    return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
  };
  const fakeFs = { lstatSync: stat, watch: (_, __, cb) => { event = cb; return {close(){}}; } };
  const sandbox = { module: {exports:{}}, Buffer, console, Date,
    setInterval: cb => { intervals.push(cb); return cb; }, clearInterval() {},
    setTimeout: cb => { timers.set(cb, cb); return cb; }, clearTimeout: cb => timers.delete(cb),
    require: name => name === 'fs' ? fakeFs : name === 'fs/promises' ? { lstat: async p => stat(p), readdir: async () => [] } : require(name),
  };
  vm.runInNewContext(source, sandbox);
  const watcher = sandbox.module.exports.startUploadWatcher({ folderPath: root,
    apiClient: {deleteFolder: async id => calls.push(id)}, getKnownCloudFiles: () => files, getKnownCloudFolders: () => folders,
    onUploaded(){}, onLog: (message, kind) => logs.push({ message, kind }),
  });
  return {calls, logs, disk, watcher, event: key => event('rename',key), flush: async () => {
    for (const cb of timers.values()) await cb(); timers.clear();
    for (const cb of intervals) await cb();
    await new Promise(setImmediate);
  }};
}
describe('watcher deletion regression', () => {
  it('retains the deletion observed before debounce even if a stale native manifest recreates the folder', async () => {
    const h = harness();
    h.event('docs');
    h.disk.add('C:\\isolated-sync-test\\docs');
    await h.flush();
    expect(h.calls).toEqual(['folder-id']);
    h.watcher.stop();
  });

  // Reproduz o incidente real (Gilvando, 23/09): renomear/mover uma pasta
  // grande localmente derruba UM único evento de "sumiu" pro fs.watch —
  // sem esse freio, isso apagaria (na Nuvem, para a Lixeira) a pasta
  // inteira, com tudo dentro dela, sem nenhuma confirmação.
  it('refuses to auto-delete a large known folder, and logs instead of enqueueing it', async () => {
    const bigFolders = new Map([
      ['Colaboradores_compactado', 'root-folder-id'],
      ['Colaboradores_compactado/Ativos', 'ativos-id'],
      ...Array.from({ length: 30 }, (_, i) => [`Colaboradores_compactado/Ativos/Funcionario ${i}`, `f${i}`]),
    ]);
    const bigFiles = new Map(
      Array.from({ length: 30 }, (_, i) => [`Colaboradores_compactado/Ativos/Funcionario ${i}/rg.pdf`, { fileId: `file${i}`, fileSize: 10 }])
    );
    const h = harness({ folders: bigFolders, files: bigFiles });
    h.event('Colaboradores_compactado');
    await h.flush();
    expect(h.calls).toEqual([]);
    expect(h.logs.some(l => l.kind === 'error' && l.message.includes('Colaboradores_compactado'))).toBe(true);
    h.watcher.stop();
  });
});
