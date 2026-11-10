import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LayoutDashboard, ListChecks, Package, Settings2, Plus, Search, FolderOpen, CopyPlus, Trash2, Loader2, Download, Upload, Users, ShieldCheck, AlertTriangle, MessageCircleQuestion, Figma, Clock, ArrowRight, UserCircle2 } from "lucide-react";
import { Btn, Modal, inputCls, fmtDate, Field } from "./ui.jsx";
import { jobStore, isRunning } from "./jobs.js";
import { pipeContext, productKey } from "./config.js";
import { STATUSES, statusOf, useTeam, usePeers, presenceAvailable } from "./team.js";
import { Avatar, Person, StatusPill } from "./teamui.jsx";

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pipelines", label: "Spec pipelines", icon: ListChecks },
  { id: "products", label: "Products", icon: Package },
  { id: "workspace", label: "Workspace", icon: Settings2 },
];

export function Sidebar({ view, setView, counts }) {
  const t = useTeam();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-gutter py-2 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
      {NAV.map((n) => (
        <button key={n.id} onClick={() => setView(n.id)} aria-current={view === n.id ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm ${view === n.id ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted-strong hover:bg-surface-2 hover:text-fg"}`}>
          <n.icon size={16} aria-hidden="true" />{n.label}{counts?.[n.id] ? <span className="ml-auto rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-muted">{counts[n.id]}</span> : null}
        </button>
      ))}
      <div className="hidden lg:mt-auto lg:flex lg:flex-col lg:gap-1 lg:border-t lg:border-line lg:pt-3">
        {t.me ? <Person id={t.me} size={24} /> : <span className="text-xs text-muted">Not signed in</span>}
        <span className="text-[11px] text-muted">{t.local ? "Name kept in this browser" : t.admin ? "Admin: manages products" : "Member"}</span>
      </div>
    </nav>
  );
}

const oqCount = (p) => (p.res ? (p.res.ux?.gaps?.length || 0) + (p.res.reviewNotes?.openQuestions || []).filter((c) => !c.done).length : 0);

function Kpi({ label, value, sub, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-0.5 rounded-lg border border-line bg-surface p-4 text-left hover:border-accent/50">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm font-medium">{label}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </button>
  );
}

function MiniList({ title, icon: I, items, empty, onOpen, cfg }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-surface">
      <h3 className="flex items-center gap-1.5 border-b border-line px-4 py-2.5 text-sm font-semibold"><I size={15} aria-hidden="true" />{title}<span className="ml-auto text-xs font-normal text-muted">{items.length}</span></h3>
      <ul className="divide-y divide-line">
        {items.slice(0, 6).map((p) => (
          <li key={p.id}><button onClick={() => onOpen(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.ado?.title || "Untitled ADO"}</span><span className="block truncate text-xs text-muted">{[pipeContext(p, cfg).productName || "No product", p.ado?.id].filter(Boolean).join(" · ")}</span></span>
            <StatusPill status={statusOf(p)} small />
          </button></li>
        ))}
        {!items.length && <li className="px-4 py-4 text-sm text-muted">{empty}</li>}
      </ul>
    </section>
  );
}

export function Dashboard({ cfg, pipelines, onOpen, onNew, setView, setFilter }) {
  const t = useTeam();
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  const peers = usePeers();
  const all = Object.values(pipelines);
  const by = (s) => all.filter((p) => statusOf(p) === s);
  const mine = all.filter((p) => p.assignee && p.assignee === t.me && statusOf(p) !== "done");
  const waiting = by("po_review");
  const openQs = all.filter((p) => statusOf(p) !== "done").reduce((a, p) => a + oqCount(p), 0);
  const feed = all.flatMap((p) => (p.activity || []).map((a) => ({ ...a, pid: p.id, title: p.ado?.title || p.ado?.id || "Untitled ADO" }))).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  const online = [...new Map(peers.map((p) => [p.uid, p])).values()];
  const go = (status) => { setFilter({ status }); setView("pipelines"); };
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-gutter pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Dashboard</h2><p className="text-sm text-muted">Where every spec stands, what's waiting on a PO and what's assigned to you.</p></div>
        <Btn variant="primary" icon={Plus} onClick={onNew}>New spec pipeline</Btn>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="All pipelines" value={all.length} onClick={() => go("")} />
        {STATUSES.slice(0, 5).map((s) => <Kpi key={s.id} label={s.label} value={by(s.id).length} onClick={() => go(s.id)} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MiniList title="Assigned to you" icon={UserCircle2} items={mine} empty={t.me ? "Nothing assigned to you right now." : "Set your name in Workspace to see your work."} onOpen={onOpen} cfg={cfg} />
        <MiniList title="Waiting on PO" icon={MessageCircleQuestion} items={waiting} empty="No pipelines in PO review." onOpen={onOpen} cfg={cfg} />
        <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle size={15} aria-hidden="true" />Open PO questions</h3>
          <p className="text-3xl font-semibold tabular-nums">{openQs}</p>
          <p className="text-xs text-muted">Gaps and unanswered review questions across pipelines that aren't done.</p>
          <h3 className="mt-2 flex items-center gap-1.5 text-sm font-semibold"><Users size={15} aria-hidden="true" />Online now</h3>
          {presenceAvailable() ? (online.length ? <div className="flex flex-wrap gap-2">{online.map((p) => <Person key={p.uid} id={p.uid} />)}</div> : <p className="text-xs text-muted">Only you.</p>) : <p className="text-xs text-muted">Presence isn't available in this view.</p>}
        </section>
      </div>
      <section className="rounded-lg border border-line bg-surface">
        <h3 className="flex items-center gap-1.5 border-b border-line px-4 py-2.5 text-sm font-semibold"><Clock size={15} aria-hidden="true" />Recent activity</h3>
        <ol className="divide-y divide-line">
          {feed.map((a, i) => (
            <li key={i}><button onClick={() => onOpen(a.pid)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
              <Avatar id={a.by} size={22} />
              <span className="min-w-0 flex-1 text-sm"><span className="font-semibold">{a.by === t.me ? "You" : t.name(a.by)}</span> <span className="text-muted-strong">{a.type === "note" ? "noted" : a.type === "status" ? "moved" : a.type}</span> <span className="font-medium">{a.title}</span>{a.text ? <span className="block truncate text-xs text-muted">{a.text}</span> : null}</span>
              <span className="shrink-0 text-[11px] text-muted">{fmtDate(a.at)}</span>
            </button></li>
          ))}
          {!feed.length && <li className="px-4 py-4 text-sm text-muted">Activity from the team shows up here.</li>}
        </ol>
      </section>
    </main>
  );
}

export function PipelinesList({ cfg, pipelines, loading, onOpen, onNew, onDuplicate, onDelete, storeMode, filter, setFilter }) {
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  const t = useTeam();
  const [del, setDel] = useState(null);
  const f = { q: "", status: "", product: "", who: "", ...filter };
  const set = (patch) => setFilter({ ...f, ...patch });
  const products = [...new Set(Object.values(pipelines).map((p) => pipeContext(p, cfg).productName.trim()).filter(Boolean))].sort();
  const people = [...new Set(Object.values(pipelines).flatMap((p) => [p.assignee, p.createdBy]).filter(Boolean))];
  const list = Object.values(pipelines).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).filter((p) => {
    if (f.status && statusOf(p) !== f.status) return false;
    if (f.product && productKey(pipeContext(p, cfg).productName) !== productKey(f.product)) return false;
    if (f.who === "me" && p.assignee !== t.me) return false;
    if (f.who === "none" && p.assignee) return false;
    if (f.who && !["me", "none"].includes(f.who) && p.assignee !== f.who) return false;
    if (f.q && ![p.ado?.id, p.ado?.title, p.ado?.po, p.journeyNode, pipeContext(p, cfg).productName, t.name(p.assignee)].join(" ").toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
  const sel = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 px-gutter pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Spec pipelines</h2><p className="text-sm text-muted">Every ADO turned into a PRD, matrices and a Figma design. Filter by status, product or person.</p></div>
        <Btn variant="primary" icon={Plus} onClick={onNew}>New spec pipeline</Btn>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative"><span className="sr-only">Search pipelines</span><Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-muted" /><input id="search" className={`${inputCls} w-64 pl-8`} placeholder="Search ADO, title, product, PO, person" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <select aria-label="Status" className={sel} value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select aria-label="Product" className={sel} value={f.product} onChange={(e) => set({ product: e.target.value })}><option value="">All products</option>{products.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select aria-label="Assignee" className={sel} value={f.who} onChange={(e) => set({ who: e.target.value })}><option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>{people.filter((id) => id !== t.me).map((id) => <option key={id} value={id}>{t.name(id)}</option>)}</select>
        {(f.q || f.status || f.product || f.who) && <Btn size="sm" variant="ghost" onClick={() => setFilter({})}>Clear filters</Btn>}
        <span className="ml-auto text-xs text-muted">{list.length} of {Object.keys(pipelines).length}</span>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>
      ) : !list.length ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface p-10 text-center">
          <FolderOpen size={28} className="text-muted" aria-hidden="true" />
          <p className="font-semibold">{Object.keys(pipelines).length ? "No pipelines match these filters" : "No spec pipelines yet"}</p>
          <p className="max-w-md text-sm text-muted">{Object.keys(pipelines).length ? "Change or clear the filters." : "Start one by pasting an Azure DevOps feature."}</p>
          {!Object.keys(pipelines).length && <Btn variant="primary" icon={Plus} onClick={onNew}>New spec pipeline</Btn>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[60rem] text-sm">
            <thead><tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 font-semibold">Feature</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Assignee</th><th className="px-3 py-2 font-semibold">Journey node</th>
              <th className="px-3 py-2 text-right font-semibold">ACs</th><th className="px-3 py-2 text-right font-semibold">Open Qs</th><th className="px-3 py-2 font-semibold">Last change</th><th className="w-20 px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((p) => (
                <tr key={p.id} className="cursor-pointer align-top hover:bg-surface-2/60" onClick={() => onOpen(p.id)}>
                  <td className="max-w-[22rem] px-4 py-3">
                    <button className="text-left font-semibold hover:text-accent hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }}>{p.ado?.title || "Untitled ADO"}</button>
                    <p className="text-xs text-muted">{[pipeContext(p, cfg).productName.trim() || "No product", p.ado?.id, p.ado?.po && `PO ${p.ado.po}`].filter(Boolean).join(" · ")}{p.example ? " · Example" : ""}</p>
                  </td>
                  <td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><StatusPill status={statusOf(p)} small />{isRunning(p.id) && <span className="flex items-center gap-1 text-[11px] text-accent-strong"><Loader2 size={11} className="animate-spin" />{isRunning(p.id, "figma") ? "Building in Figma" : "Building prototype"}</span>}</div></td>
                  <td className="px-3 py-3"><Person id={p.assignee} /></td>
                  <td className="max-w-[14rem] truncate px-3 py-3 text-xs" title={p.journeyNode}><span className="font-mono">{String(p.journeyNode || "").split(" ")[0]}</span></td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{p.res ? (p.res.validation || []).length : "—"}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{p.res ? oqCount(p) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-muted"><span className="flex items-center gap-1.5">{p.updatedBy && <Avatar id={p.updatedBy} size={18} />}{fmtDate(p.updatedAt)}</span></td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-0.5">
                      <Btn variant="ghost" size="sm" icon={CopyPlus} aria-label={`Duplicate ${p.ado?.title || "pipeline"}`} title="Duplicate" onClick={() => onDuplicate(p)} />
                      <Btn variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${p.ado?.title || "pipeline"}`} title="Delete" onClick={() => setDel(p)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{storeMode === "db" ? "Shared: everyone this page is shared with sees and edits the same pipelines." : "Saved in this browser only."}</p>
      {del && (
        <Modal title="Delete this spec pipeline?" onClose={() => setDel(null)} footer={<><Btn onClick={() => setDel(null)}>Cancel</Btn><Btn variant="danger" icon={Trash2} onClick={() => { onDelete(del.id); setDel(null); }}>Delete pipeline</Btn></>}>
          <p className="text-sm">“{del.ado?.title || "Untitled ADO"}” and its PRD, audit, matrices, activity and Figma run history will be removed for everyone. Frames already built in Figma stay there.{isRunning(del.id) ? " Its running job will be stopped." : ""}</p>
        </Modal>
      )}
    </main>
  );
}

export function Products({ cfg, pipelines, onNew, onOpen, setView, setFilter }) {
  const t = useTeam();
  const groups = useMemo(() => {
    const m = new Map();
    for (const p of Object.values(cfg.products || {})) m.set(productKey(p.name), { name: p.name, profile: p, pipes: [] });
    for (const p of Object.values(pipelines)) {
      const n = pipeContext(p, cfg).productName.trim(); const k = productKey(n) || "__none";
      if (!m.has(k)) m.set(k, { name: n || "No product", profile: null, pipes: [], none: !n });
      m.get(k).pipes.push(p);
    }
    return [...m.values()].sort((a, b) => (a.none ? 1 : b.none ? -1 : a.name.localeCompare(b.name)));
  }, [cfg.products, pipelines]);
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 px-gutter pb-16 pt-6">
      <div><h2 className="text-xl font-semibold">Products</h2><p className="max-w-[80ch] text-sm text-muted">Pipelines with the same product name share its PRD template, design-system slots and style guide, and are references for each other's suggestions. Figma files are always per pipeline. {t.admin ? "As an admin you can change a product's template and design system from any of its pipelines (Configuration & context)." : "Only admins change a product's template and design system."}</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const ds = (g.profile?.slots || []).map((s) => s.name);
          const active = (g.profile?.slots || []).find((s) => s.id === g.profile?.activeSlot)?.name;
          return (
            <section key={g.name} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-semibold"><Package size={16} aria-hidden="true" />{g.name}</h3>
                <span className="text-xs text-muted">{g.pipes.length} pipeline{g.pipes.length === 1 ? "" : "s"}</span>
              </div>
              {g.none ? <p className="text-sm text-muted">Pipelines without a product keep their own template and design system and aren't references for anyone.</p> : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">PRD template</dt><dd className="truncate">{g.profile?.template?.name || "Default template"}</dd>
                  <dt className="text-muted">Design system</dt><dd className="truncate">{active || ds[0] || "Example Design System"}{ds.length > 1 ? <span className="text-muted"> · {ds.length} slots</span> : null}</dd>
                  <dt className="text-muted">Updated</dt><dd>{g.profile?.updatedAt ? fmtDate(g.profile.updatedAt) : "—"}</dd>
                </dl>
              )}
              <div className="flex flex-wrap gap-1.5">{STATUSES.map((s) => { const n = g.pipes.filter((p) => statusOf(p) === s.id).length; return n ? <button key={s.id} onClick={() => { setFilter({ product: g.none ? "" : g.name, status: s.id }); setView("pipelines"); }}><StatusPill status={s.id} small /><span className="ml-1 text-xs tabular-nums text-muted">{n}</span></button> : null; })}</div>
              <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                {!g.none && <Btn size="sm" icon={Plus} onClick={() => onNew({ productName: g.name })}>New pipeline</Btn>}
                <Btn size="sm" variant="ghost" icon={ArrowRight} onClick={() => { setFilter({ product: g.none ? "" : g.name }); setView("pipelines"); }}>See pipelines</Btn>
              </div>
            </section>
          );
        })}
        {!groups.length && <p className="text-sm text-muted">No products yet. Name the product in a pipeline (step 1) to create one.</p>}
      </div>
    </main>
  );
}

export function Workspace({ cfg, pipelines, storeMode, onExport, onImport, onName, aiCard }) {
  const t = useTeam();
  const file = useRef(null);
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-gutter pb-16 pt-6">
      <div><h2 className="text-xl font-semibold">Workspace</h2><p className="text-sm text-muted">You, your AI provider, sharing and backups.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><UserCircle2 size={15} />You</h3>
          {t.me ? <Person id={t.me} size={32} /> : <p className="text-sm text-muted">No name yet.</p>}
          <p className="text-sm text-muted-strong">{t.local ? "Your name is kept in this browser and shown on what you create, edit or are assigned." : `Signed in through Claude. Role: ${t.admin ? "admin (can change products' PRD templates and design systems)" : "member (works on pipelines)"}.`}</p>
          {t.local && <div><Btn size="sm" onClick={onName}>{t.me ? "Change name" : "Set your name"}</Btn></div>}
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck size={15} />Sharing with the team</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-strong">
            <li>{storeMode === "db" ? "Pipelines and products are shared by everyone who can open this page." : "This copy saves in this browser only; open the shared page to work as a team."}</li>
            <li>Share it with your organization only, never by public link: pipelines hold internal ADO content.</li>
            <li>People need access that lets them contribute to work on pipelines; admins (edit access) manage products.</li>
            <li>Claude and Figma run with each person's own access; for Figma builds they need edit access to the target file.</li>
          </ul>
        </section>
      </div>
      {aiCard}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Download size={15} />Backup and move</h3>
        <p className="max-w-[80ch] text-sm text-muted-strong">Export saves every pipeline and product setting ({Object.keys(pipelines).length} pipelines, {Object.keys(cfg.products || {}).length} products) to one JSON file. Import adds them to this workspace; pipelines with the same id are replaced by the newer copy. Use it to back up, or to move your data into another copy of this app.</p>
        <div className="flex flex-wrap gap-2">
          <Btn icon={Download} onClick={onExport}>Export workspace (.json)</Btn>
          <Btn icon={Upload} onClick={() => file.current?.click()} disabled={!t.canWrite}>Import workspace</Btn>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        </div>
        {!t.admin && <p className="text-xs text-muted">Product settings in an import are applied only by admins; pipelines are imported for everyone.</p>}
      </section>
    </main>
  );
}
