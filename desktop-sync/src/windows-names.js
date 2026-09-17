const crypto = require('crypto');
const { validateComponent } = require('./sync-safety');

// Keep a separate, persistent Windows name for each cloud ID. Never merge IDs:
// same-name folders can contain different files and have different permissions.
function assignWindowsNames(folders, files, registry = {}) {
  const items = [
    ...folders.map(item => ({ ...item, kind: 'folder', parent: item.parentId || null })),
    ...files.map(item => ({ ...item, kind: 'file', parent: item.folderId || null })),
  ];
  const used = new Map();
  const bucket = parent => {
    const key = JSON.stringify(parent);
    if (!used.has(key)) used.set(key, new Map());
    return used.get(key);
  };
  // Reserve names of absent IDs too: another item must not take over a path
  // that still has a deletion pending or local content from the previous ID.
  for (const [id, record] of Object.entries(registry)) {
    validateComponent(record.localName);
    const names = bucket(record.parent);
    const key = record.localName.toLowerCase();
    if (names.has(key) && names.get(key) !== id) throw Error('Registro de nomes Windows inconsistente.');
    names.set(key, id);
  }
  const originals = new Map();
  for (const item of items) {
    validateComponent(item.name);
    const key = JSON.stringify(item.parent);
    if (!originals.has(key)) originals.set(key, new Set());
    originals.get(key).add(item.name.toLowerCase());
  }
  const namesById = new Map();
  const aliases = [];
  items.sort((a,b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`, 'en'));
  for (const item of items) {
    const id = `${item.kind}:${item.id}`;
    const old = registry[id];
    const siblings = bucket(item.parent);
    let name;
    if (old && old.name === item.name && old.parent === item.parent) name = old.localName;
    else {
      name = item.name;
      if (siblings.has(name.toLowerCase()) && siblings.get(name.toLowerCase()) !== id) {
        const dot = item.kind === 'file' ? name.lastIndexOf('.') : -1;
        const extension = dot > 0 && name.length - dot <= 20 ? name.slice(dot) : '';
        const stem = extension ? name.slice(0, -extension.length) : name;
        const hash = crypto.createHash('sha256').update(id).digest('hex').slice(0, 10);
        let attempt = 0;
        do {
          const suffix = ` (nuvem-${hash}${attempt ? '-' + attempt : ''})`;
          name = stem.slice(0, 255 - suffix.length - extension.length) + suffix + extension;
          attempt++;
        } while (siblings.has(name.toLowerCase()) || originals.get(JSON.stringify(item.parent)).has(name.toLowerCase()));
      }
      // Release the old reservation only when this same ID was explicitly renamed/moved.
      if (old) bucket(old.parent).delete(old.localName.toLowerCase());
      registry[id] = { name: item.name, parent: item.parent, localName: name };
    }
    siblings.set(name.toLowerCase(), id);
    namesById.set(id, name);
    if (name !== item.name) aliases.push({ id, original: item.name, localName: name });
  }
  return { folders: folders.map(f => ({ ...f, name: namesById.get(`folder:${f.id}`) })),
    files: files.map(f => ({ ...f, name: namesById.get(`file:${f.id}`) })), aliases };
}
module.exports = { assignWindowsNames };
