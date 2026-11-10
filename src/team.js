/* Team layer: who is using the app (user capability), who is here right now (room presence), statuses,
   assignees and the activity log of each pipeline. Every part degrades gracefully: without the user
   capability people pick a display name once (kept in this browser); without room there is no presence. */
import { useEffect, useState, useSyncExternalStore } from "react";

export const STATUSES = [
  { id: "draft", label: "Draft", tone: "neutral", hint: "ADO being prepared or analyzed" },
  { id: "po_review", label: "PO review", tone: "warn", hint: "Questions sent to the PO" },
  { id: "approved", label: "Approved", tone: "ok", hint: "Scope agreed, ready to design" },
  { id: "in_design", label: "In design", tone: "accent", hint: "Being designed in Figma" },
  { id: "handoff", label: "Ready for handoff", tone: "ok", hint: "Design done, waiting on build" },
  { id: "done", label: "Done", tone: "neutral", hint: "Delivered" },
];
export const statusById = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
/* Pipelines made before statuses existed get one from their progress. */
export const statusOf = (p) => p.status || ((p.figmaRuns || []).some((r) => r.ok) ? "in_design" : "draft");

/* ---------- identity ---------- */
const LS_ME = "adoPipeline.me";
const names = new Map();       // id -> { name, avatar }
const subs = new Set();
let ver = 0;
const emit = () => { ver++; subs.forEach((f) => f()); };
const state = { user: null, me: null, admin: true, canWrite: true, ready: false, local: true };

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS_ME) || "null"); } catch { return null; } };
export function setLocalName(name) {
  const n = String(name || "").trim().slice(0, 60);
  if (!n) return;
  const me = { id: "name:" + n, name: n };
  try { localStorage.setItem(LS_ME, JSON.stringify(me)); } catch {}
  state.me = me.id; names.set(me.id, { name: n }); emit();
}

export async function initTeam(userCap) {
  state.user = userCap || null;
  if (userCap) {
    try {
      const id = await userCap.id();
      state.me = id; state.local = false;
      const me = await userCap.me?.();
      if (me?.name) names.set(id, { name: me.name, avatar: me.avatar || me.image || null });
      state.admin = !!(userCap.isOwner?.() || userCap.canEdit?.());
      const w = userCap.can?.("data.write");
      state.canWrite = w === null || w === undefined ? true : !!w;
    } catch { state.user = null; }
  }
  if (!state.user) {
    const m = readLocal();
    if (m?.id) { state.me = m.id; names.set(m.id, { name: m.name }); }
    state.admin = true; state.canWrite = true; state.local = true;
  }
  state.ready = true; emit();
}

const pendingIds = new Set(); let lookup = null;
function resolve(ids) {
  for (const id of ids) {
    if (!id || names.has(id)) continue;
    if (String(id).startsWith("name:")) { names.set(id, { name: id.slice(5) }); continue; }
    pendingIds.add(id);
  }
  if (!pendingIds.size || !state.user?.profiles || lookup) return;
  lookup = setTimeout(async () => {
    const batch = [...pendingIds]; pendingIds.clear(); lookup = null;
    try {
      const ps = await state.user.profiles(batch);
      for (const id of batch) { const p = ps?.[id]; names.set(id, { name: p?.name || "", avatar: p?.avatar || p?.image || null }); }
    } catch { for (const id of batch) names.set(id, { name: "" }); }
    emit();
  }, 30);
}

export const team = {
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  snapshot: () => ver,
  get me() { return state.me; },
  get admin() { return state.admin; },
  get canWrite() { return state.canWrite; },
  get local() { return state.local; },
  get ready() { return state.ready; },
  name(id) { if (!id) return ""; resolve([id]); return names.get(id)?.name || (id === state.me ? "You" : "Someone"); },
  avatar(id) { return names.get(id)?.avatar || null; },
  async search(q) {
    if (state.user?.search) { try { const hits = await state.user.search(q || ""); return (hits || []).map((h) => { names.set(h.id, { name: h.name || "", avatar: h.avatar || h.image || null }); return h.id; }); } catch {} }
    return [];
  },
};
export function useTeam() { useSyncExternalStore(team.subscribe, team.snapshot); return team; }

/* ---------- activity ---------- */
export function addActivity(p, type, text, extra = {}) {
  const e = { at: new Date().toISOString(), by: team.me || null, type, text, ...extra };
  return [e, ...(p.activity || [])].slice(0, 120);
}

/* ---------- presence ---------- */
const peers = { list: [], ver: 0, subs: new Set() };
let room = null, myState = {}, last = 0, timer = null;
export async function initRoom(roomCap) {
  room = roomCap || null;
  if (!room?.onPeers) return;
  try {
    room.onPeers((all) => {
      const arr = Array.isArray(all) ? all : Object.values(all || {});
      peers.list = arr.map((p) => ({ ...(p?.state || p?.presence || p?.data || p || {}), self: !!(p?.self || p?.you || p?.isSelf), guest: !!p?.guest })).filter((s) => s.uid);
      peers.ver++; peers.subs.forEach((f) => f());
    });
    pushPresence({});
  } catch { room = null; }
}
/* Absolute state, throttled: { pid, step, editingAt }. */
export function pushPresence(patch) {
  if (!room?.presence) return;
  myState = { ...myState, ...patch, uid: team.me || "anon" };
  const send = () => { last = Date.now(); try { room.presence(myState); } catch {} };
  clearTimeout(timer);
  const wait = 3000 - (Date.now() - last);
  if (wait <= 0) send(); else timer = setTimeout(send, wait);
}
export function usePeers() {
  useSyncExternalStore((f) => { peers.subs.add(f); return () => peers.subs.delete(f); }, () => peers.ver);
  return peers.list.filter((p) => !p.self && p.uid !== team.me);
}
export const presenceAvailable = () => !!room?.presence;

/* Re-render every few seconds so "editing now" fades out. */
export function useTick(ms = 5000) { const [, set] = useState(0); useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]); }
