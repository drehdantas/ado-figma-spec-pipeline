import React, { useState } from "react";
import { Lightbulb as Bulb, History, Sparkles, Loader2, FileText, CheckCircle2, AlertTriangle, XCircle, Copy, Download, Layers, GitCompare, ListChecks, MessageSquareWarning, Accessibility, Lightbulb, HelpCircle, Check, Plus, Trash2, Send } from "lucide-react";
import { STATUSES } from "./engine.js";
import { Badge, Btn, Editable, Field, inputCls, copyText, ratingTone, ratingIcon, statusTone, prdTone, prdLabel } from "./ui.jsx";
/* ---------------- Step 2 ---------------- */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(([k, l, I, count]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${value === k ? "border-accent font-semibold text-fg" : "border-transparent text-muted hover:text-fg"}`}>
          {I && <I size={15} aria-hidden="true" />}{l}{count !== undefined && <span className="rounded bg-surface-2 px-1.5 font-mono text-[11px] tabular-nums text-muted">{count}</span>}
        </button>
      ))}
    </div>
  );
}

function SuggestBox({ items, onUse, onAppend, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-accent/30 bg-accent-soft/50 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-strong"><Bulb size={12} aria-hidden="true" />Suggested answer{items.length > 1 ? "s" : ""}</p>
      {items.map((it, k) => (
        <div key={k} className="flex flex-col gap-1.5 rounded border border-line bg-surface p-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {it.source === "history" ? <><History size={12} aria-hidden="true" /><span>From history · {it.from}{it.match ? ` · ${it.match}% similar` : ""}</span></> : <><Sparkles size={12} aria-hidden="true" /><span>AI as UX designer · basis: {it.basis || "mixed"}{it.confidence ? ` · ${it.confidence} confidence` : ""}</span></>}
          </div>
          <p className="whitespace-pre-wrap text-sm">{it.text}</p>
          <div className="flex flex-wrap gap-1.5">
            <Btn size="sm" variant="primary" onClick={() => onUse(it)}>Use this</Btn>
            {onAppend && <Btn size="sm" onClick={() => onAppend(it)}>Append</Btn>}
            {onDismiss && <Btn size="sm" variant="ghost" onClick={() => onDismiss(it)}>Dismiss</Btn>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Step2({ cfg, ado, res, setRes, notify, onPdf, pdfBusy, history = {}, onSuggest, suggestBusy, aiLabel }) {
  const [tab, setTab] = useState("prd");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const sections = cfg.template.sections;
  const counts = sections.reduce((a, s) => { const st = res.prd[s.id]?.status || "missing"; a[st]++; return a; }, { filled: 0, partial: 0, missing: 0 });
  const pct = Math.round(((counts.filled + counts.partial * 0.5) / sections.length) * 100);
  const setSec = (id, content) => setRes({ ...res, prd: { ...res.prd, [id]: { status: content.trim() ? (res.prd[id]?.status === "missing" ? "partial" : res.prd[id]?.status || "partial") : "missing", content } } });
  const rc = res.stories.reduce((a, s) => ((a[s.rating] = (a[s.rating] || 0) + 1), a), {});
  const poQs = res.ux.gaps.map((g, i) => `${i + 1}. [${g.severity}] ${g.title}\n   ${g.ask}${g.answer ? `\n   Proposed answer: ${g.answer}` : ""}`).join("\n");
  const sug = res.suggestions || { sections: {}, gaps: {} };
  const dismissed = new Set(res.dismissed || []);
  const sugFor = (id) => [...(sug.sections?.[id] && !dismissed.has("ai:" + id) ? [{ ...sug.sections[id], source: "ai", key: "ai:" + id }] : []), ...(history[id] || []).filter((h) => !dismissed.has("h:" + id + ":" + h.from) && h.text.trim() !== String(res.prd[id]?.content || "").trim()).map((h) => ({ ...h, key: "h:" + id + ":" + h.from }))];
  const useSec = (id, text, append) => setRes({ ...res, prd: { ...res.prd, [id]: { status: "partial", proposed: true, content: append && res.prd[id]?.content ? `${res.prd[id].content}\n\n${text}` : text } } });
  const dismiss = (key) => setRes({ ...res, dismissed: [...(res.dismissed || []), key] });
  const gapsMissing = sections.filter((x) => (res.prd[x.id]?.status || "missing") !== "filled").length;
  const openOQ = res.reviewNotes.openQuestions.filter((c) => !c.done);
  const poText = `Questions for ${ado.po || "the PO"} on ${ado.id || "the ADO"} – ${ado.title}\n\n${poQs}${openOQ.length ? `\n\nOpen questions from design review\n${openOQ.map((c, i) => `${i + 1}. ${c.title}: ${c.body}`).join("\n")}` : ""}`;
  const crit = res.ux.gaps.filter((g) => g.severity === "Critical Gap").length;
  let lastGroup = "";

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="PO review pack" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent/40 bg-accent-soft p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><Send size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg">PO review pack · {res.ux.gaps.length + openOQ.length} questions for {ado.po || "the Product Owner"}</h3>
            <p className="text-sm text-muted-strong">{crit} critical gap{crit === 1 ? "" : "s"}, {res.ux.gaps.length - crit} to clarify{openOQ.length ? `, ${openOQ.length} open from design review` : ""}. Send these before final design.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" icon={Copy} onClick={() => copyText(poText, notify)}>Copy PO questions</Btn>
          <Btn icon={Download} disabled={pdfBusy} onClick={onPdf}>{pdfBusy ? "Building PDF…" : "Download PDF (analysis + questions)"}</Btn>
        </div>
      </section>
      <Tabs value={tab} onChange={setTab} tabs={[["prd", "A · Structured PRD", FileText, `${pct}%`], ["audit", "B · User story & UX readiness audit", MessageSquareWarning, res.ux.gaps.length]]} />
      {tab === "prd" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Template coverage · {cfg.template.name}</p>
              <p className="mt-1 text-sm"><span className="font-mono text-2xl font-semibold tabular-nums">{pct}%</span> <span className="text-muted">of sections covered by the ADO</span></p>
              <div className="mt-2 flex h-2 w-64 max-w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <span className="bg-ok-dot" style={{ width: `${(counts.filled / sections.length) * 100}%` }} />
                <span className="bg-warn-dot" style={{ width: `${(counts.partial / sections.length) * 100}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok" icon={CheckCircle2}>{counts.filled} complete</Badge>
              <Badge tone="warn" icon={AlertTriangle}>{counts.partial} partial</Badge>
              <Badge tone="bad" icon={XCircle}>{counts.missing} missing</Badge>
              <label className="ml-2 flex items-center gap-1.5 text-sm"><input id="onlyGaps" type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} className="accent-[rgb(var(--accent))]" />Show gaps only</label>
            </div>
          </div>
          {gapsMissing > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
              <p className="flex min-w-0 items-start gap-2 text-sm"><Bulb size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /><span><span className="font-semibold">{gapsMissing} sections</span> are missing or partial. Suggestions from earlier ADOs in your history appear under each one{Object.keys(history).length ? "" : " (none similar yet)"}. Ask {aiLabel || "the AI"} to propose the rest as a UX designer.</span></p>
              {onSuggest && <Btn icon={suggestBusy ? Loader2 : Sparkles} disabled={suggestBusy} onClick={onSuggest}>{suggestBusy ? "Proposing…" : Object.keys(sug.sections || {}).length ? "Propose again" : "Suggest answers"}</Btn>}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {sections.map((s) => {
              const v = res.prd[s.id] || { status: "missing", content: "" };
              if (onlyGaps && v.status === "filled") return null;
              const head = s.group !== lastGroup ? (lastGroup = s.group) : null;
              return (
                <React.Fragment key={s.id}>
                  {head && <h3 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">{head}</h3>}
                  <article className={`rounded-lg border p-3 ${v.status === "missing" ? "border-dashed border-bad-line bg-bad-bg/40" : v.status === "partial" ? "border-line bg-surface" : "border-line bg-surface"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold"><span className="mr-2 font-mono text-xs text-muted">{s.id}</span>{s.title}</h4>
                      {v.proposed ? <Badge tone="accent" icon={Bulb}>Proposed · confirm with PO</Badge> : <Badge tone={prdTone(v.status)}>{prdLabel(v.status)}</Badge>}
                    </div>
                    {v.status !== "filled" && <p className="mt-1 text-xs text-muted">Template asks for: {s.guidance}</p>}
                    <div className="mt-2 text-sm leading-relaxed"><Editable value={v.content} onChange={(c) => setSec(s.id, c)} placeholder="Not provided by the ADO – click to add" className="p-1" /></div>
                    {v.status !== "filled" && !v.proposed && <SuggestBox items={sugFor(s.id)} onUse={(it) => useSec(s.id, it.text)} onAppend={v.content ? (it) => useSec(s.id, it.text, true) : null} onDismiss={(it) => dismiss(it.key)} />}
                  </article>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
      {tab === "audit" && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Problem understanding & UX impact</h3>
                <Badge tone={res.ux.verdict === "Sufficient" ? "ok" : res.ux.verdict === "Insufficient" ? "bad" : "warn"}>{res.ux.verdict}</Badge>
              </div>
              <p className="mt-2 max-w-[75ch] text-sm leading-relaxed">{res.ux.problem}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2 md:w-80">
              {["Strong", "Needs Clarification", "Critical Gap"].map((r) => (
                <div key={r} className="rounded-lg border border-line bg-surface p-3">
                  <dt className="text-[11px] leading-tight text-muted">{r}</dt>
                  <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{rc[r] || 0}</dd>
                </div>
              ))}
            </dl>
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">User stories ({res.stories.length})</h3>
            {!res.stories.length && <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">The ADO has no user stories. Ask the PO for the primary user and the outcome they need.</p>}
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[40rem] text-sm">
                <thead><tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted"><th className="w-16 px-3 py-2 font-semibold">ID</th><th className="px-3 py-2 font-semibold">Story</th><th className="w-44 px-3 py-2 font-semibold">Quality</th><th className="px-3 py-2 font-semibold">Critique</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {res.stories.map((s, i) => (
                    <tr key={s.id} className="align-top hover:bg-surface-2/60">
                      <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                      <td className="px-3 py-2">{s.text}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={ratingTone(s.rating)} icon={ratingIcon(s.rating)}>{s.rating}</Badge>
                          <select aria-label={`Quality of ${s.id}`} value={s.rating} onChange={(e) => { const st = [...res.stories]; st[i] = { ...s, rating: e.target.value }; setRes({ ...res, stories: st }); }} className="rounded border border-line bg-surface px-1 py-0.5 text-xs text-muted">
                            {["Strong", "Needs Clarification", "Critical Gap"].map((r) => <option key={r}>{r}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-strong">{s.critique}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Gaps to raise with the Product Owner ({res.ux.gaps.length})</h3>
              <div className="flex flex-wrap gap-2">
                {onSuggest && <Btn size="sm" icon={suggestBusy ? Loader2 : Sparkles} disabled={suggestBusy} onClick={onSuggest}>{suggestBusy ? "Proposing…" : "Suggest answers"}</Btn>}
                <Btn size="sm" icon={Copy} onClick={() => copyText(poText, notify)}>Copy PO questions</Btn>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {res.ux.gaps.map((g, i) => (
                <article key={i} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={g.severity === "Critical Gap" ? "bad" : "warn"} icon={ratingIcon(g.severity)}>{g.severity}</Badge><span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{g.category}</span></div>
                  <h4 className="text-sm font-semibold">{g.title}</h4>
                  <p className="text-sm text-muted-strong">{g.detail}</p>
                  <p className="mt-auto flex gap-1.5 rounded-md bg-accent-soft px-2 py-1.5 text-sm text-accent-strong"><HelpCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span><span className="font-semibold">Ask: </span>{g.ask}</span></p>
                  {g.answer ? (
                    <div className="flex flex-col gap-1 rounded-md border border-line p-2 text-sm"><span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted"><Bulb size={12} />Proposed answer · confirm with PO</span><span>{g.answer}</span>
                      <button className="self-start text-xs text-muted underline hover:text-fg" onClick={() => { const gs = [...res.ux.gaps]; gs[i] = { ...g, answer: "" }; setRes({ ...res, ux: { ...res.ux, gaps: gs } }); }}>Remove</button></div>
                  ) : sug.gaps?.[i] && !dismissed.has("g:" + i) ? (
                    <SuggestBox items={[{ text: sug.gaps[i].answer, source: "ai", basis: "work item + UX judgement", confidence: sug.gaps[i].confidence }]}
                      onUse={(it) => { const gs = [...res.ux.gaps]; gs[i] = { ...g, answer: it.text }; setRes({ ...res, ux: { ...res.ux, gaps: gs } }); }} onDismiss={() => dismiss("g:" + i)} />
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Acceptance criteria extracted ({res.validation.length})</h3>
            <ol className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
              {res.validation.map((v) => <li key={v.ac} className="flex gap-2"><span className="w-12 shrink-0 font-mono text-xs leading-5 text-muted">{v.ac}</span><span className={v.status === "Blocked" ? "text-bad-fg" : ""}>{v.requirement}</span></li>)}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 3 ---------------- */
function ValidationMatrix({ res, setRes }) {
  const [f, setF] = useState("All");
  const rows = res.validation;
  const upd = (i, k, val) => { const v = [...rows]; v[i] = { ...v[i], [k]: val }; setRes({ ...res, validation: v }); };
  const counts = STATUSES.reduce((a, s) => ((a[s] = rows.filter((r) => r.status === s).length), a), {});
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {["All", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setF(s)} aria-pressed={f === s} className={`rounded-full border px-2.5 py-1 text-xs ${f === s ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line text-muted hover:text-fg"}`}>
            {s === "All" ? `All ${rows.length}` : `${s.replace(" - No Comp Needed", "")} ${counts[s]}`}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">Click any cell to edit</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[68rem] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="w-20 px-3 py-2 font-semibold">AC ID</th><th className="w-64 px-3 py-2 font-semibold">Requirement summary</th><th className="w-48 px-3 py-2 font-semibold">Design status</th><th className="w-40 px-3 py-2 font-semibold">Figma screen / journey node</th><th className="px-3 py-2 font-semibold">Open questions & required PO decisions</th><th className="px-3 py-2 font-semibold">UX & accessibility recommendations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (f === "All" || r.status === f) && (
              <tr key={r.ac + i} className={`align-top hover:bg-surface-2/60 ${r.status === "Blocked" ? "bg-bad-bg/30" : ""}`}>
                <td className="px-3 py-2 font-mono text-xs font-semibold">{r.ac}</td>
                <td className="px-2 py-1.5"><Editable value={r.requirement} onChange={(v) => upd(i, "requirement", v)} className="p-1" /></td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={statusTone(r.status)} icon={r.status === "Designed" ? CheckCircle2 : r.status === "Blocked" ? XCircle : FileText}>{r.status === "Designed" ? "Designed" : r.status === "Blocked" ? "Blocked" : "Documented / Dev note"}</Badge>
                    <select aria-label={`Design status for ${r.ac}`} value={r.status} onChange={(e) => upd(i, "status", e.target.value)} className="w-full rounded border border-line bg-surface px-1 py-0.5 text-xs text-muted">
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-xs"><Editable value={r.node} onChange={(v) => upd(i, "node", v)} className="p-1" /></td>
                <td className="px-2 py-1.5"><Editable value={r.questions} onChange={(v) => upd(i, "questions", v)} className="p-1" /></td>
                <td className="px-2 py-1.5 text-muted-strong"><Editable value={r.recs} onChange={(v) => upd(i, "recs", v)} className="p-1" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><Btn size="sm" icon={Plus} onClick={() => setRes({ ...res, validation: [...rows, { ac: `AC-${String(rows.length + 1).padStart(2, "0")}`, requirement: "", status: "Designed", node: "", questions: "", recs: "" }] })}>Add AC row</Btn></div>
    </div>
  );
}

function DriftMatrix({ res, setRes, dsName }) {
  const c = res.driftColumns;
  const rows = res.drift;
  const upd = (i, k, v) => { const d = [...rows]; d[i] = { ...d[i], [k]: v }; setRes({ ...res, drift: d }); };
  const setCol = (k, v) => setRes({ ...res, driftColumns: { ...c, [k]: v } });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
        <Field label="Primary / target"><input id="colPrimary" className={inputCls} value={c.primary} onChange={(e) => setCol("primary", e.target.value)} /></Field>
        <Field label="Variant A"><input id="colA" className={inputCls} value={c.variantA} onChange={(e) => setCol("variantA", e.target.value)} /></Field>
        <Field label="Variant B"><input id="colB" className={inputCls} value={c.variantB} onChange={(e) => setCol("variantB", e.target.value)} /></Field>
        <p className="text-xs text-muted">Design system: <span className="font-semibold text-fg">{dsName}</span></p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[72rem] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="w-44 px-3 py-2 font-semibold">Component / feature aspect</th>
              <th className="px-3 py-2 font-semibold text-accent-strong">{c.primary}</th><th className="px-3 py-2 font-semibold">{c.variantA}</th><th className="px-3 py-2 font-semibold">{c.variantB}</th>
              <th className="px-3 py-2 font-semibold">Design system vs. local precedent drift</th><th className="px-3 py-2 font-semibold">Strategic recommendation / conditional logic</th><th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i} className="align-top hover:bg-surface-2/60">
                <td className="px-2 py-1.5 font-semibold"><Editable value={r.aspect} onChange={(v) => upd(i, "aspect", v)} className="p-1" /></td>
                {["primary", "variantA", "variantB"].map((k) => (
                  <td key={k} className={`px-2 py-1.5 ${/assum|confirm/i.test(r[k]) ? "text-warn-fg" : ""}`}><Editable value={r[k]} onChange={(v) => upd(i, k, v)} className="p-1" /></td>
                ))}
                <td className="px-2 py-1.5 text-muted-strong"><Editable value={r.drift} onChange={(v) => upd(i, "drift", v)} className="p-1" /></td>
                <td className="px-2 py-1.5"><Editable value={r.rec} onChange={(v) => upd(i, "rec", v)} className="p-1" /></td>
                <td className="px-1 py-1.5"><Btn variant="ghost" size="sm" icon={Trash2} aria-label={`Delete row ${r.aspect}`} onClick={() => setRes({ ...res, drift: rows.filter((_, j) => j !== i) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Cells marked “assumed” or “confirm” are shown in amber text: they need a market owner’s confirmation.</p>
      <div><Btn size="sm" icon={Plus} onClick={() => setRes({ ...res, drift: [...rows, { aspect: "New aspect", primary: "", variantA: "", variantB: "", drift: "", rec: "" }] })}>Add aspect</Btn></div>
    </div>
  );
}

function ReviewBoard({ res, setRes }) {
  const rn = res.reviewNotes;
  const v = res.validation;
  const designed = v.filter((r) => r.status === "Designed").length, doc = v.filter((r) => r.status.startsWith("Doc")).length, miss = v.filter((r) => r.status === "Blocked").length;
  const answered = [...rn.openQuestions].filter((c) => c.done).length;
  const summary = `${designed} designed, ${doc} documented only (no UI), ${miss} missing or blocked.${answered ? " Open question answers are now built in." : ""}`;
  const toggle = (key, i) => { const arr = [...rn[key]]; arr[i] = { ...arr[i], done: !arr[i].done }; setRes({ ...res, reviewNotes: { ...rn, [key]: arr } }); };
  const col = [
    ["openQuestions", "Open questions", "Open question", "border-t-rn-orange", HelpCircle],
    ["recommendations", "Recommendations", "Recommendation", "border-t-rn-navy", Lightbulb],
    ["accessibility", "Accessibility concerns", "Accessibility", "border-t-rn-red", Accessibility],
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-board p-4 sm:p-6">
      <div className="min-w-[56rem] max-w-[72rem]">
        <h3 className="text-2xl font-bold tracking-tight">Review notes</h3>
        <p className="mt-1 max-w-[90ch] text-sm text-muted-strong">Acceptance-criteria coverage, then the unanswered questions, recommendations and accessibility concerns found while designing the screens on the left. Each card names the screens ({res.validation.find((r) => /J\d/.test(r.node))?.node.split(",")[0].replace(/\.\d+$/, ".x") || "Jx.x.x"}) and acceptance criteria (AC) it affects.</p>
        <p className="mt-3 text-xs text-faint">Card · AC coverage</p>
        <div className="mt-1 rounded-sm border border-line bg-surface p-5 shadow-sm">
          <h4 className="text-base font-bold">Acceptance-criteria coverage</h4>
          <p className="mt-1 text-xs text-muted-strong">{summary}</p>
          <table className="mt-4 w-full text-xs">
            <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-muted"><th className="w-20 py-2 font-semibold">AC</th><th className="py-2 font-semibold">Requirement</th><th className="w-56 py-2 font-semibold">Screens</th><th className="w-36 py-2 font-semibold">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {v.map((r) => (
                <tr key={r.ac}><td className="py-2.5 font-mono">{r.ac}</td><td className="py-2.5 pr-4">{r.requirement}</td><td className="py-2.5 pr-4 font-mono text-[11px]">{r.node}</td>
                  <td className="py-2.5"><Badge tone={statusTone(r.status)}>{r.status === "Designed" ? "Designed" : r.status === "Blocked" ? "Missing" : "Documented only"}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-6">
          {col.map(([key, title, eyebrow, border, I]) => (
            <div key={key} className="flex flex-col gap-3">
              <p className="text-xs text-faint">Column · {title.replace(" concerns", "")}</p>
              <h4 className="-mt-2 text-lg font-bold">{title} ({rn[key].length})</h4>
              {rn[key].map((c, i) => (
                <article key={i} className={`rounded-sm border border-line border-t-4 ${border} bg-surface p-4 shadow-sm`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-strong"><I size={11} aria-hidden="true" />{eyebrow} {i + 1}</p>
                    <button onClick={() => toggle(key, i)} title="Toggle status">{c.done ? <Badge tone="ok" icon={Check}>Completed</Badge> : <Badge tone="neutral">Open</Badge>}</button>
                  </div>
                  <h5 className="mt-2 text-[15px] font-bold leading-snug">{c.title}</h5>
                  <p className="mt-2 text-xs leading-relaxed">{c.body}</p>
                  {c.answer && <p className="mt-1 text-xs leading-relaxed"><span className="font-semibold">Answer:</span> {c.answer}</p>}
                  {c.affects && <p className="mt-1 text-xs text-muted-strong">{/^Affects/i.test(c.affects) ? "" : key === "openQuestions" ? "Affects " : ""}{c.affects}</p>}
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Step3({ cfg, res, setRes }) {
  const [tab, setTab] = useState("validation");
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onChange={setTab} tabs={[["validation", "A · AC validation matrix", ListChecks, res.validation.length], ["drift", "B · System & regional drift", GitCompare, res.drift.length], ["board", "Review notes board (Figma)", Layers]]} />
      {tab === "validation" && <ValidationMatrix res={res} setRes={setRes} />}
      {tab === "drift" && <DriftMatrix res={res} setRes={setRes} dsName={cfg.dsName} />}
      {tab === "board" && <><p className="text-sm text-muted">Preview of the board placed to the right of the Figma frames, following your matrix style guide. Click a status tag to toggle Open / Completed.</p><ReviewBoard res={res} setRes={setRes} /></>}
    </div>
  );
}

