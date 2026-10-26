import React, { useMemo, useRef } from "react";
import { FileText, AlertTriangle, ArrowRight, Wand2, Square, Cpu, Link2, User, Users, Hash, Filter } from "lucide-react";
import { Btn, Field, inputCls } from "./ui.jsx";
import { extractACs, extractStories } from "./engine.js";
import { MarkdownEditor, mdForPrompt, imageRefs } from "./mdeditor.jsx";
import { DEMO_ADO } from "./sample/demo.js";

export function Step1({ ado, setAdo, updAdo, engine, setEngine, aiLabel, run, busy, progress, stop, err, upToDate, assets, notify }) {
  const plain = useMemo(() => mdForPrompt(ado.raw), [ado.raw]);
  const stories = useMemo(() => extractStories(plain), [plain]);
  const acs = useMemo(() => extractACs(plain), [plain]);
  const latestAdo = useRef(ado); latestAdo.current = ado;
  const gaps = useMemo(() => { const n = acs.map((a) => +a.id.slice(3)); const m = []; for (let i = 1; i < Math.max(0, ...n); i++) if (!n.includes(i)) m.push(`AC-${String(i).padStart(2, "0")}`); return m; }, [acs]);
  const isDemo = ado.raw === DEMO_ADO.raw;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Field label="Feature title" icon={FileText}><input id="adoTitle" className={inputCls} value={ado.title} onChange={(e) => setAdo({ ...ado, title: e.target.value })} placeholder="Feature name" /></Field>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="ADO ID" icon={Hash}><input id="adoId" className={inputCls} value={ado.id} onChange={(e) => setAdo({ ...ado, id: e.target.value })} placeholder="ADO-12345" /></Field>
          <Field label="ADO link" icon={Link2}><input id="adoLink" className={inputCls} value={ado.link} onChange={(e) => setAdo({ ...ado, link: e.target.value })} placeholder="https://dev.azure.com/…" /></Field>
          <Field label="Product Owner" icon={User}><input id="adoPo" className={inputCls} value={ado.po} onChange={(e) => setAdo({ ...ado, po: e.target.value })} placeholder="Name" /></Field>
          <Field label="Stakeholders" icon={Users}>
            <input id="adoStakeholders" className={inputCls} value={ado.stakeholders || ""} onChange={(e) => setAdo({ ...ado, stakeholders: e.target.value })} placeholder="Name (role), Name (role)…" title="Comma-separated names and roles. Used in the PRD, the PO pack and suggestions." />
          </Field>
        </div>
        {String(ado.stakeholders || "").trim() && <div className="-mt-2 flex flex-wrap gap-1">{String(ado.stakeholders).split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((x) => <span key={x} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{x}</span>)}</div>}
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="adoRaw" className="text-[11px] font-semibold uppercase tracking-wider text-muted">Raw ADO feature story, description, business logic and acceptance criteria</label>
          <MarkdownEditor id="adoRaw" value={ado.raw} onChange={(raw) => updAdo((a) => ({ ...a, raw }))}
            images={ado.images} onImages={(fn) => updAdo((a) => ({ ...a, images: fn(a.images) }))}
            assets={assets} notify={notify}
            placeholder={"Paste the work item from Azure DevOps: text, tables and screenshots all work.\n\n## Description\n…\n\n## User stories\n- As a …, I want …, so that …\n\n## Acceptance criteria\nAC-01 …"} />
        </div>
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold">Detected while you type</h3>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[["Stories", stories.length], ["ACs", acs.length], ["Images", imageRefs(ado.raw).length]].map(([k, v]) => (
              <div key={k} className="rounded-md bg-surface-2 py-2"><dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt><dd className="font-mono text-lg font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          {gaps.length > 0 && <p className="mt-3 flex items-start gap-1.5 rounded-md bg-bad-bg px-2 py-1.5 text-xs text-bad-fg"><AlertTriangle size={14} className="mt-px shrink-0" />Numbering gap: {gaps.join(", ")} missing</p>}
          {ado.raw && !stories.length && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warn-bg px-2 py-1.5 text-xs text-warn-fg"><AlertTriangle size={14} className="mt-px shrink-0" />No “As a … I want …” stories found</p>}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold">Analysis engine</h3>
          <div role="radiogroup" aria-label="Analysis engine" className="mt-3 flex flex-col gap-2">
            {[["ai", `AI · ${aiLabel}`, "Reads the ADO, its images, your template and design system. Change the agent in Configuration › AI provider."], ["local", "Local rules", "Instant keyword rules, no AI. Good for a quick first pass."]].map(([k, l, d]) => (
              <button key={k} role="radio" aria-checked={engine === k} onClick={() => setEngine(k)}
                className={`flex gap-2 rounded-md border p-2.5 text-left disabled:opacity-50 ${engine === k ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${engine === k ? "border-accent" : "border-line"}`}>{engine === k && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
                <span><span className="flex items-center gap-1 text-sm font-medium">{k === "ai" ? <Cpu size={14} /> : <Filter size={14} />}{l}</span><span className="block text-xs text-muted">{d}</span></span>
              </button>
            ))}
          </div>
          {isDemo && <p className="mt-2 text-xs text-muted">Example ADO: its precomputed analysis is used, so no AI call is made.</p>}
        </div>
        <Btn variant="primary" icon={upToDate ? ArrowRight : Wand2} disabled={!ado.raw.trim() || busy} onClick={run} className="h-11">
          {upToDate ? "Continue to structured PRD & audit" : "Convert ADO to Structured PRD & Analyze"}
        </Btn>
        {upToDate && <p className="-mt-2 text-xs text-muted">The analysis matches this ADO text. Edit the text to convert again.</p>}
        {busy && (
          <div role="status" className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-3 text-sm">
            <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{progress}</span>
            <Btn size="sm" icon={Square} onClick={stop}>Stop</Btn>
          </div>
        )}
        {err && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">{err}</p>}
      </aside>
    </div>
  );
}

