import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, UserPlus, Check, MessageSquare, Send, Users, Eye } from "lucide-react";
import { STATUSES, statusById, useTeam, usePeers, useTick } from "./team.js";
import { Btn, inputCls, fmtDate, Modal, Field } from "./ui.jsx";
import { setLocalName } from "./team.js";

const HUES = [210, 262, 330, 20, 150, 190, 45, 290];
const hue = (id) => HUES[[...String(id || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
export function Avatar({ id, size = 24, ring }) {
  const t = useTeam();
  const name = t.name(id);
  const img = t.avatar(id);
  const ini = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const st = { width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${hue(id)} 55% 42%)` };
  return img
    ? <img src={img} alt="" title={name} className={`shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-surface" : ""}`} style={{ width: size, height: size }} />
    : <span aria-hidden="true" title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${ring ? "ring-2 ring-surface" : ""}`} style={st}>{ini}</span>;
}
export function Person({ id, size = 20, empty = "Unassigned" }) {
  const t = useTeam();
  if (!id) return <span className="text-xs text-muted">{empty}</span>;
  return <span className="inline-flex min-w-0 items-center gap-1.5"><Avatar id={id} size={size} /><span className="truncate text-xs">{id === t.me ? `${t.name(id)} (you)` : t.name(id)}</span></span>;
}

const toneCls = { neutral: "bg-surface-2 text-muted-strong border-line", warn: "bg-warn-bg text-warn-fg border-warn-fg/30", ok: "bg-ok-bg text-ok-fg border-ok-fg/30", accent: "bg-accent-soft text-accent-strong border-accent/40" };
export function StatusPill({ status, small }) {
  const s = statusById(status);
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 ${small ? "py-0 text-[11px]" : "py-0.5 text-xs"} font-medium ${toneCls[s.tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{s.label}</span>;
}

function useOutside(ref, close) { useEffect(() => { const f = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []); }

export function StatusMenu({ status, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null); useOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-full disabled:opacity-60" aria-label={`Status: ${statusById(status).label}. Change status`}>
        <StatusPill status={status} /><ChevronDown size={14} className="text-muted" aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 z-40 mt-1 w-64 rounded-md border border-line bg-surface p-1 shadow-lg">
          {STATUSES.map((s) => (
            <li key={s.id}><button role="option" aria-selected={s.id === status} onClick={() => { setOpen(false); if (s.id !== status) onChange(s.id); }} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2">
              <span className="mt-0.5 w-4">{s.id === status && <Check size={14} className="text-accent" />}</span>
              <span><StatusPill status={s.id} small /><span className="mt-0.5 block text-xs text-muted">{s.hint}</span></span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssigneePicker({ value, onChange, known = [], disabled }) {
  const t = useTeam();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const ref = useRef(null); useOutside(ref, () => setOpen(false));
  useEffect(() => { if (!open) return; let live = true; t.search(q).then((r) => live && setHits(r)); return () => { live = false; }; }, [open, q]);
  const pool = [...new Set([t.me, ...hits, ...known].filter(Boolean))].filter((id) => !q || t.name(id).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative" ref={ref}>
      <button disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface-2 disabled:opacity-60" aria-label="Change assignee">
        {value ? <Person id={value} /> : <span className="flex items-center gap-1 text-xs text-muted"><UserPlus size={14} />Assign</span>}<ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border border-line bg-surface p-2 shadow-lg">
          <input autoFocus className={inputCls} placeholder={t.local ? "Filter people" : "Search people"} value={q} onChange={(e) => setQ(e.target.value)} />
          <ul role="listbox" className="mt-1 max-h-56 overflow-auto">
            {pool.map((id) => <li key={id}><button role="option" aria-selected={id === value} onClick={() => { setOpen(false); onChange(id); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2"><Person id={id} />{id === value && <Check size={14} className="ml-auto text-accent" />}</button></li>)}
            {!pool.length && <li className="px-2 py-1.5 text-xs text-muted">No one found.</li>}
            {value && <li><button onClick={() => { setOpen(false); onChange(null); }} className="w-full rounded px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-2">Remove assignee</button></li>}
          </ul>
          {t.local && <p className="mt-1 px-1 text-[11px] text-muted">People appear here once they've used the app.</p>}
        </div>
      )}
    </div>
  );
}

/* Who else has this pipeline open, and whether they are typing in it now. */
export function PresenceBar({ pid }) {
  useTick(5000);
  const peers = usePeers().filter((p) => p.pid === pid);
  const t = useTeam();
  if (!peers.length) return null;
  const editing = peers.filter((p) => p.editingAt && Date.now() - p.editingAt < 20000);
  const uniq = [...new Map(peers.map((p) => [p.uid, p])).values()];
  return (
    <div role="status" className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${editing.length ? "border-warn-fg/30 bg-warn-bg text-warn-fg" : "border-line bg-surface text-muted-strong"}`}>
      <span className="flex -space-x-1.5">{uniq.slice(0, 5).map((p) => <Avatar key={p.uid} id={p.uid} size={22} ring />)}</span>
      {editing.length
        ? <span><span className="font-semibold">{[...new Set(editing.map((p) => t.name(p.uid)))].join(", ")}</span> {editing.length > 1 ? "are" : "is"} editing this pipeline now. Changes save field by field, but avoid editing the same field at the same time.</span>
        : <span><Eye size={14} className="mr-1 inline" aria-hidden="true" />{[...new Set(uniq.map((p) => t.name(p.uid)))].join(", ")} also {uniq.length > 1 ? "have" : "has"} this pipeline open.</span>}
    </div>
  );
}

/* Activity log with notes. */
const ACT_LABEL = { created: "created the pipeline", status: "changed the status", assignee: "changed the assignee", converted: "converted the ADO", matrices: "built the matrices", figma: "generated the Figma page", prototype: "built the prototype", note: "added a note", imported: "imported the pipeline" };
export function ActivityPanel({ activity = [], onNote, canWrite }) {
  const [text, setText] = useState("");
  const t = useTeam();
  const send = () => { if (!text.trim()) return; onNote(text.trim()); setText(""); };
  return (
    <section aria-label="Activity and notes" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquare size={15} aria-hidden="true" />Activity & notes</h3>
      {canWrite && (
        <div className="flex gap-2">
          <textarea aria-label="Add a note" rows={2} className="min-w-0 flex-1 resize-y rounded-md border border-line bg-surface p-2 text-sm placeholder:text-muted focus:outline focus:outline-2 focus:outline-accent" placeholder="Add a note for the team: a decision, a PO answer, a blocker…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
          <Btn variant="primary" icon={Send} onClick={send} disabled={!text.trim()} aria-label="Post note" />
        </div>
      )}
      <ol className="flex max-h-80 flex-col gap-2.5 overflow-auto">
        {activity.map((a, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <Avatar id={a.by} size={22} />
            <div className="min-w-0">
              <p><span className="font-semibold">{a.by ? (a.by === t.me ? "You" : t.name(a.by)) : "Someone"}</span> <span className="text-muted-strong">{a.type === "note" ? "" : ACT_LABEL[a.type] || a.type}</span>{a.type !== "note" && a.text ? <span className="text-muted-strong"> · {a.text}</span> : ""}</p>
              {a.type === "note" && <p className="whitespace-pre-wrap rounded-md bg-surface-2 px-2 py-1.5">{a.text}</p>}
              <p className="text-[11px] text-muted">{fmtDate(a.at)}</p>
            </div>
          </li>
        ))}
        {!activity.length && <li className="text-sm text-muted">Nothing yet. Status changes, conversions, Figma builds and notes show up here.</li>}
      </ol>
    </section>
  );
}

/* Without the user capability, people name themselves once (kept in this browser). */
export function NameDialog({ onClose }) {
  const [n, setN] = useState("");
  return (
    <Modal title="What's your name?" onClose={onClose}
      footer={<><Btn onClick={onClose}>Later</Btn><Btn variant="primary" disabled={!n.trim()} onClick={() => { setLocalName(n); onClose(); }}>Save</Btn></>}>
      <p className="mb-3 text-sm text-muted-strong">Your name is shown on the pipelines you create, edit or are assigned to, so the team knows who did what.</p>
      <Field label="Display name"><input autoFocus id="myName" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && n.trim()) { setLocalName(n); onClose(); } }} /></Field>
    </Modal>
  );
}
export { Users };
