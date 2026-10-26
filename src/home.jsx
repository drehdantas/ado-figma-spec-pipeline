import React, { useState, useSyncExternalStore } from "react";
import { Plus, Search, FolderOpen, CopyPlus, Trash2, Loader2 } from "lucide-react";
import { Badge, Btn, Modal, inputCls, fmtDate } from "./ui.jsx";
import { jobStore, isRunning } from "./jobs.js";

/* ---------------- Home: history of spec pipelines ---------------- */
const statusOf = (p) => {
  const runs = p.figmaRuns || [];
  if (runs.some((r) => r.ok)) return ["In Figma", "accent"];
  if (p.res) return [p.step >= 3 ? "Matrices ready" : "Analyzed", "ok"];
  return [p.ado?.raw?.trim() ? "Draft" : "Empty", "neutral"];
};
export function Home({ pipelines, loading, onOpen, onNew, onDuplicate, onDelete, storeMode }) {
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  const [q, setQ] = useState("");
  const [del, setDel] = useState(null);
  const list = Object.values(pipelines).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .filter((p) => !q || [p.ado?.id, p.ado?.title, p.ado?.po, p.journeyNode].join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-gutter pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Spec pipelines</h2>
          <p className="text-sm text-muted">Every ADO you've turned into a PRD, matrices and a Figma design. Open one to continue where you left off.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><span className="sr-only">Search pipelines</span><Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-muted" /><input id="search" className={`${inputCls} w-64 pl-8`} placeholder="Search ADO, title, PO, node" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <Btn variant="primary" icon={Plus} onClick={onNew}>New spec pipeline</Btn>
        </div>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>
      ) : !list.length ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface p-10 text-center">
          <FolderOpen size={28} className="text-muted" aria-hidden="true" />
          <p className="font-semibold">{q ? "No pipelines match your search" : "No spec pipelines yet"}</p>
          <p className="max-w-md text-sm text-muted">{q ? "Try another ADO ID, title or PO name." : "Start one by pasting an Azure DevOps feature. Each pipeline keeps its PRD, audit, matrices and Figma runs here."}</p>
          {!q && <Btn variant="primary" icon={Plus} onClick={onNew}>New spec pipeline</Btn>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[56rem] text-sm">
            <thead><tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 font-semibold">Feature</th><th className="px-3 py-2 font-semibold">Journey node</th><th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">ACs</th><th className="px-3 py-2 text-right font-semibold">Blocked</th><th className="px-3 py-2 text-right font-semibold">Open questions</th>
              <th className="px-3 py-2 font-semibold">Updated</th><th className="w-24 px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((p) => {
                const [st, tone] = isRunning(p.id) ? ["Building in Figma…", "accent"] : statusOf(p);
                const v = p.res?.validation || [];
                const oq = p.res ? (p.res.ux?.gaps?.length || 0) + (p.res.reviewNotes?.openQuestions || []).filter((c) => !c.done).length : null;
                return (
                  <tr key={p.id} className="cursor-pointer align-top hover:bg-surface-2/60" onClick={() => onOpen(p.id)}>
                    <td className="max-w-[22rem] px-4 py-3">
                      <button className="text-left font-semibold hover:text-accent hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }}>{p.ado?.title || "Untitled ADO"}</button>
                      <p className="text-xs text-muted">{[p.ado?.id, p.ado?.po && `PO ${p.ado.po}`].filter(Boolean).join(" · ") || "No ADO details yet"}{p.example ? " · Example" : ""}</p>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-3 text-xs" title={p.journeyNode}><span className="font-mono">{p.journeyNode.split(" ")[0]}</span> <span className="text-muted">{p.journeyNode.split(" ").slice(1).join(" ")}</span></td>
                    <td className="px-3 py-3"><Badge tone={tone} icon={isRunning(p.id) ? Loader2 : undefined}>{st}</Badge></td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{p.res ? v.length : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{p.res ? v.filter((r) => r.status === "Blocked").length : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{oq ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{fmtDate(p.updatedAt)}</td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        <Btn variant="ghost" size="sm" icon={CopyPlus} aria-label={`Duplicate ${p.ado?.title || "pipeline"}`} title="Duplicate" onClick={() => onDuplicate(p)} />
                        <Btn variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${p.ado?.title || "pipeline"}`} title="Delete" onClick={() => setDel(p)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{storeMode === "db" ? "Saved with this page: anyone you share it with sees the same list." : "Saved in this browser only."}</p>
      {del && (
        <Modal title="Delete this spec pipeline?" onClose={() => setDel(null)} footer={<><Btn onClick={() => setDel(null)}>Cancel</Btn><Btn variant="danger" icon={Trash2} onClick={() => { onDelete(del.id); setDel(null); }}>Delete pipeline</Btn></>}>
          <p className="text-sm">“{del.ado?.title || "Untitled ADO"}” and its PRD, audit, matrices and Figma run history will be removed. Frames already built in Figma stay there.{isRunning(del.id) ? " Its Figma build is still running and will be stopped." : ""}</p>
        </Modal>
      )}
    </main>
  );
}

