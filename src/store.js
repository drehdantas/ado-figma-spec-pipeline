/* Persistence: the artifact's shared db when available, else this browser's localStorage. */
const LS = "adoPipeline.v3";
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || "null") || { config: null, pipelines: {} }; } catch { return { config: null, pipelines: {} }; } };
const lsWrite = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} };

export async function openStore({ seed }) {
  let db = null;
  try { db = window.claude?.use ? await window.claude.use("db") : null; } catch { db = null; }

  if (!db) {
    const s = lsRead();
    if (!Object.keys(s.pipelines).length && seed) { s.pipelines[seed.id] = seed; lsWrite(s); }
    const subs = new Set();
    const emit = () => { const p = lsRead().pipelines; subs.forEach((f) => f(p)); };
    return {
      mode: "local",
      async getConfig() { return lsRead().config; },
      async saveConfig(c) { const s = lsRead(); s.config = c; lsWrite(s); },
      subscribe(cb) { subs.add(cb); cb(lsRead().pipelines); return () => subs.delete(cb); },
      async savePipeline(p) { const s = lsRead(); s.pipelines[p.id] = p; lsWrite(s); emit(); },
      async deletePipeline(id) { const s = lsRead(); delete s.pipelines[id]; lsWrite(s); emit(); },
    };
  }

  const queue = new Map(); // one write at a time per doc
  const write = (ref, data) => {
    const prev = queue.get(ref.path) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => ref.set(data));
    queue.set(ref.path, next);
    return next;
  };
  return {
    mode: "db",
    async getConfig() { const s = await db.doc("settings/config").get(); return s.exists ? s.data() : null; },
    saveConfig(c) { return write(db.doc("settings/config"), c); },
    subscribe(cb, onErr) {
      return db.collection("pipelines").onSnapshot((snap) => {
        const out = {};
        snap.docs.forEach((d) => { out[d.id] = { ...d.data(), id: d.id }; });
        cb(out);
      }, (e) => onErr && onErr(e));
    },
    savePipeline(p) { return write(db.collection("pipelines").doc(p.id), JSON.parse(JSON.stringify(p))); },
    deletePipeline(id) { return db.collection("pipelines").doc(id).delete(); },
  };
}
