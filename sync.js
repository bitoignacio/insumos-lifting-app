// Sincronización con Google Sheets a través del Apps Script (apps-script/Code.gs).
// Los cambios se guardan primero en el dispositivo; si no hay internet quedan en cola y se envían solos al volver.
const Sync = (() => {
  let timer = null;
  let running = false;
  let status = { state: 'off', pending: 0, last: null, error: null };
  const listeners = new Set();

  const cfg = () => (typeof App !== 'undefined' && App.config) || {};
  const configured = () => !!(cfg().url && cfg().clave);

  function emit() { listeners.forEach(fn => fn(status)); }
  function onChange(fn) { listeners.add(fn); fn(status); }

  function schedule(delay = 800) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  async function call(payload) {
    // text/plain evita la verificación CORS previa que Apps Script no responde.
    const res = await fetch(cfg().url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, clave: cfg().clave }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error en la planilla');
    return data;
  }

  async function push() {
    const ops = (await DB.outbox()).sort((a, b) => a.ts.localeCompare(b.ts));
    status.pending = ops.length;
    for (let i = 0; i < ops.length; i += 100) {
      const batch = ops.slice(i, i + 100);
      await call({ action: 'push', ops: batch.map(o => ({ table: o.table, record: o.record })) });
      await DB.clearOps(batch.map(o => o.opId));
      status.pending = Math.max(0, status.pending - batch.length);
      emit();
    }
  }

  async function pull() {
    const since = await DB.getMeta('lastPull', '');
    const data = await call({ action: 'pull', since });
    let changed = 0;
    for (const table of Object.keys(data.records || {})) {
      changed += await DB.applyRemote(table, data.records[table]);
    }
    await DB.setMeta('lastPull', data.now);
    return changed;
  }

  async function run() {
    if (running) return;
    const pending = (await DB.outbox()).length;
    status.pending = pending;
    if (!configured()) { status.state = 'off'; status.error = 'Falta conectar la planilla (Ajustes)'; emit(); return; }
    if (!navigator.onLine) { status.state = 'pending'; status.error = 'Sin conexión: los cambios quedan guardados'; emit(); return; }
    running = true;
    try {
      await push();
      const changed = await pull();
      status = { state: 'ok', pending: 0, last: new Date(), error: null };
      emit();
      if (changed && typeof App !== 'undefined') App.refresh();
      if (typeof App !== 'undefined') App.revisarPagos();
    } catch (e) {
      status.state = 'pending';
      status.error = 'No se pudo sincronizar: ' + e.message;
      emit();
      schedule(30000);
    } finally {
      running = false;
    }
  }

  window.addEventListener('online', () => schedule(200));
  window.addEventListener('offline', () => run());
  setInterval(() => schedule(0), 60000);

  return { schedule, run, onChange, call, get status() { return status; } };
})();
