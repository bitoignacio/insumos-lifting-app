// Almacenamiento local (IndexedDB). Todo funciona sin conexión; sync.js envía los cambios a Google Sheets.
const DB = (() => {
  const NAME = 'insumos-lifting';
  const VERSION = 2;
  // Tablas de negocio: se sincronizan con la planilla.
  const TABLES = ['productos', 'variantes', 'clientes', 'ventas', 'compras', 'movimientos', 'proveedores'];
  let db;
  const state = {};
  TABLES.forEach(t => { state[t] = new Map(); });

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        TABLES.forEach(t => { if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' }); });
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'opId' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function load() {
    await open();
    for (const t of TABLES) {
      const rows = await getAll(t);
      state[t] = new Map(rows.map(r => [r.id, r]));
    }
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Guarda registros localmente y los deja en la cola para enviarlos a la planilla.
  async function save(table, records) {
    const list = Array.isArray(records) ? records : [records];
    const now = new Date().toISOString();
    await tx([table, 'outbox'], 'readwrite', t => {
      for (const r of list) {
        if (!r.id) r.id = uid();
        if (!r.creado) r.creado = now;
        r.actualizado = now;
        t.objectStore(table).put(r);
        t.objectStore('outbox').put({ opId: uid(), table, record: r, ts: now });
        state[table].set(r.id, r);
      }
    });
    if (typeof Sync !== 'undefined') Sync.schedule();
    return list;
  }

  // Guarda registros que vienen de la planilla (no vuelven a la cola).
  async function applyRemote(table, records) {
    if (!TABLES.includes(table) || !records.length) return 0;
    let changed = 0;
    await tx([table], 'readwrite', t => {
      for (const r of records) {
        const cur = state[table].get(r.id);
        if (cur && cur.actualizado && r.actualizado && cur.actualizado >= r.actualizado) continue;
        t.objectStore(table).put(r);
        state[table].set(r.id, r);
        changed++;
      }
    });
    return changed;
  }

  async function outbox() { return getAll('outbox'); }
  async function clearOps(opIds) {
    await tx(['outbox'], 'readwrite', t => opIds.forEach(id => t.objectStore('outbox').delete(id)));
  }
  async function getMeta(key, def) {
    return new Promise(resolve => {
      const req = db.transaction('meta').objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : def);
      req.onerror = () => resolve(def);
    });
  }
  async function setMeta(key, value) {
    await tx(['meta'], 'readwrite', t => t.objectStore('meta').put({ key, value }));
  }

  const all = table => [...state[table].values()].filter(r => !r.eliminado);
  const get = (table, id) => state[table].get(id);

  return { TABLES, load, save, applyRemote, outbox, clearOps, getMeta, setMeta, all, get, uid, state };
})();
