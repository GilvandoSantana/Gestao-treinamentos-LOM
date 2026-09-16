const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RECOVERY_DIRECTORY = '.gescon-recovery';
function validateComponent(name) {
  if (typeof name !== 'string' || !name || name.length > 255 ||
      /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name === '.' || name === '..') {
    throw new Error(`Nome incompatível com a sincronização Windows: ${JSON.stringify(name)}.`);
  }
  return name;
}
function safeRelative(relative) {
  if (typeof relative !== 'string') throw new Error('Caminho inválido.');
  const parts = relative.replace(/\\/g, '/').split('/');
  parts.forEach(validateComponent);
  return parts.join('/');
}
function safeLocalPath(root, relative) {
  const parts = safeRelative(relative).split('/');
  let current = path.resolve(root);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Links e junções não são sincronizados.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}
function isWithin(key, parent) {
  key = key.toLowerCase(); parent = parent.toLowerCase();
  return key === parent || key.startsWith(parent + '/');
}
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
module.exports = { RECOVERY_DIRECTORY, validateComponent, safeRelative, safeLocalPath, isWithin, writeJsonAtomic, readJson };
