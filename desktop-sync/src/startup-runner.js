// One initialization at a time; retry transient failures without requiring UI input.
function createStartupRunner({ start, onError, shouldRetry, delay = 30000 }) {
  let pending = null;
  let timer = null;
  let generation = 0;
  function cancel() {
    generation++;
    clearTimeout(timer);
    timer = null;
  }
  function run() {
    if (pending) return pending;
    clearTimeout(timer);
    timer = null;
    const current = generation;
    pending = Promise.resolve().then(start).catch(error => {
      if (current !== generation) return;
      const retry = shouldRetry(error);
      onError(error, retry);
      if (retry) timer = setTimeout(() => { timer = null; run(); }, delay);
    }).finally(() => { pending = null; });
    return pending;
  }
  return { run, cancel };
}
module.exports = { createStartupRunner };
