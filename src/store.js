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
      async getDoc(col, id) { try { return JSON.parse(localStorage.getItem(`${LS}.${col}.${id}`) || "null"); } catch { return null; } },
      async saveDoc(col, id, data) { try { localStorage.setItem(`${LS}.${col}.${id}`, JSON.stringify(data)); } catch { throw new Error("Browser storage is full."); } },
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
    /* With keys, only those fields are written (merged), so two people editing different parts of the
       same pipeline don't overwrite each other. */
    savePipeline(p, keys) {
      const ref = db.collection("pipelines").doc(p.id);
      if (keys && keys.length && ref.update) {
        const patch = JSON.parse(JSON.stringify(Object.fromEntries(keys.map((k) => [k, p[k] === undefined ? null : p[k]]))));
        const prev = queue.get(ref.path) || Promise.resolve();
        const next = prev.catch(() => {}).then(() => ref.update(patch)).catch(() => ref.set(JSON.parse(JSON.stringify(p))));
        queue.set(ref.path, next);
        return next;
      }
      return write(ref, JSON.parse(JSON.stringify(p)));
    },
    deletePipeline(id) { return db.collection("pipelines").doc(id).delete(); },
    async getDoc(col, id) { const s = await db.collection(col).doc(id).get(); return s.exists ? s.data() : null; },
    saveDoc(col, id, data) { return write(db.collection(col).doc(id), data); },
  };
}
