import { describe, it, expect } from 'vitest';
import { assignWindowsNames } from './windows-names';
import { generateManifestEntries } from './placeholder-sync';
import { ensureCloudFolder } from './upload-watcher';

const folders = [{id:'root',name:'SSMA'},
  {id:'a',name:'TERMO GARRAFA TÉRMICA',parentId:'root'},
  {id:'b',name:'TERMO GARRAFA TÉRMICA',parentId:'root'}];
describe('duplicate cloud names on Windows', () => {
  it('syncs every duplicate folder and its own contents without merging cloud IDs', async () => {
    const registry = {};
    const files = [{id:'f1',name:'termo.pdf',folderId:'a'}, {id:'f2',name:'termo.pdf',folderId:'b'}];
    const entries = await generateManifestEntries({getFullTree:async()=>({folders,files})},new Set(),registry);
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map(e=>e.relativePath.toLowerCase())).size).toBe(5);
    for (const file of files) {
      const parent = entries.find(e=>e.folderId===file.folderId);
      expect(entries.find(e=>e.fileId===file.id).relativePath).toBe(parent.relativePath+'\\termo.pdf');
    }
    expect(entries.excludedPaths).toEqual([]);
  });
  it('keeps aliases stable across server ordering, restart, deletion and a new conflicting ID', () => {
    const registry = {};
    const first = assignWindowsNames(folders, [], registry);
    const restarted = JSON.parse(JSON.stringify(registry));
    expect(assignWindowsNames([...folders].reverse(),[],restarted).folders.find(f=>f.id==='b').name).toBe(first.folders.find(f=>f.id==='b').name);
    const remaining = assignWindowsNames(folders.filter(f=>f.id!=='a'),[],restarted);
    expect(remaining.folders.find(f=>f.id==='b').name).toBe(first.folders.find(f=>f.id==='b').name);
    const added = assignWindowsNames([...folders.filter(f=>f.id!=='a'),{...folders[1],id:'c'}],[],restarted);
    expect(added.folders.find(f=>f.id==='c').name).not.toBe(folders[1].name);
  });
  it('handles file/file and file/folder collisions while preserving file extensions', () => {
    const result = assignWindowsNames([{id:'d',name:'termo.pdf'}],[{id:'a',name:'termo.pdf'}, {id:'b',name:'TERMO.PDF'}]);
    const names = [...result.folders,...result.files].map(f=>f.name.toLowerCase());
    expect(new Set(names).size).toBe(3);
    expect(result.files.every(f=>f.name.toLowerCase().endsWith('.pdf'))).toBe(true);
  });
  it('uses the mapped cloud parent ID when uploading inside a duplicate alias', async () => {
    const registry = {};
    const mapped = assignWindowsNames(folders,[],registry);
    const alias = mapped.folders.find(f=>f.id==='b').name;
    const known = new Map([['SSMA','root'],['SSMA/'+alias,'b']]);
    const calls=[];
    const id = await ensureCloudFolder(('SSMA/'+alias+'/Nova').toLowerCase(),{
      knownCloudFolders:known,inFlight:new Map(),onLog(){},apiClient:{createRemoteFolder:async(parent,name)=>{calls.push({parent,name});return {id:'child'};}}
    });
    expect(id).toBe('child'); expect(calls).toEqual([{parent:'b',name:'nova'}]);
  });
  it('does not permit path traversal while resolving duplicate names', () => {
    expect(()=>assignWindowsNames([{id:'a',name:'../escape'}],[])).toThrow();
  });
});
