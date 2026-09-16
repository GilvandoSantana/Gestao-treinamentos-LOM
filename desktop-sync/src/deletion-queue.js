const { isWithin, safeRelative, readJson, writeJsonAtomic } = require('./sync-safety');

// Journal is outside the sync root and scoped to server, account, contract and root.
// A network failure, pause or restart must never erase a recorded local deletion.
function createDeletionQueue({ journalPath, apiClient, onDeleted, onLog, now = Date.now }) {
  let entries = journalPath ? readJson(journalPath, []) : [];
  let running = false;
  let stopped = false;
  const persist = () => { if (journalPath) writeJsonAtomic(journalPath, entries); };
  function enqueue(key, id, isFolder) {
    key = safeRelative(key);
    if (entries.some(e => isWithin(key, e.key))) return;
    entries = entries.filter(e => !(isFolder && isWithin(e.key, key)));
    entries.push({ key, id, isFolder, attempts: 0, nextAttempt: 0 });
    persist(); // Commit intent before sending anything or waiting for debounce.
  }
  async function drain() {
    if (running || stopped) return;
    running = true;
    try {
      for (const item of [...entries].sort((a, b) => a.key.length - b.key.length)) {
        if (stopped || item.nextAttempt > now() || !entries.includes(item)) continue;
        try {
          if (item.isFolder) await apiClient.deleteFolder(item.id);
          else await apiClient.deleteFile(item.id);
          await onDeleted(item);
          entries = entries.filter(e => e !== item);
          persist();
          onLog(`"${item.key}" movido para a lixeira da Nuvem.`, 'upload');
        } catch (error) {
          item.attempts++;
          item.nextAttempt = now() + Math.min(300000, 2000 * 2 ** Math.min(item.attempts, 7));
          persist();
          onLog(`Exclusão pendente de "${item.key}": ${error.message}. A tentativa será repetida.`, 'error');
        }
      }
    } finally { running = false; }
  }
  return {
    enqueue, drain,
    contains: key => entries.some(e => isWithin(key, e.key)),
    list: () => entries.map(e => ({ ...e })),
    retry: async () => { entries.forEach(e => { e.nextAttempt = 0; }); persist(); await drain(); },
    stop: () => { stopped = true; },
  };
}
module.exports = { createDeletionQueue };
