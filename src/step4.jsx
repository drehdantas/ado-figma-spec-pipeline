import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Figma, RefreshCw, Wand2, AlertTriangle, CheckCircle2, XCircle, Circle, Loader2, ExternalLink, Code2, Copy, Download, Square } from "lucide-react";
import { Btn, Modal, Field, inputCls, copyText, fmtDate } from "./ui.jsx";
import { validationMD, driftMD, validationCSV, driftCSV, prdMD, reviewNotesMD } from "./engine.js";
import { parseFigmaUrl, runInFigma, figmaErrorText, pagesToGroups, extractPages, screenList } from "./figma.js";
import { SITEMAP_CODE, refPageCode, mergeContext, contextSummary } from "./figma-context.js";
import { draftPageName, draftIdOf, childPages } from "./figma-build.js";
import { activeDS, RULES, allNodes } from "./config.js";
import { jobStore } from "./jobs.js";
import { saveFile } from "./drawer.jsx";

export const AGENTS = {
  "Figma agent": "Build the screens as Figma frames. Use auto layout, library components and variables only (no detached styles). Name every frame with its journey node and screen name, e.g. “J1.2.1.1 – Store list”. Place frames left to right in journey order; place the Review notes board, the Validation Matrix and the Drift Matrix to the right of the last frame.",
  "Chat assistant": "Produce the screen specifications and annotated layouts for each journey node, then the matrices as Markdown tables ready to paste into Figma text frames to the right of the screens.",
  "Coding agent": "Generate React + Tailwind components for each screen using only the design-system tokens and component guardrails below. One file per screen, named by journey node. Add the matrices as Markdown in /docs.",
};

export function compile(cfg, pipe, res, inc, agent) {
  const { ado } = pipe;
  const node = pipe.journeyNode;
  const nodeId = node.split(" ")[0];
  const screens = screenList(res);
  const ds = activeDS(cfg);
  const out = [];
  out.push(`# MASTER PROMPT · ${ado.title || "Untitled feature"} (${ado.id || "no ADO id"})\n\nTarget agent: ${agent}\nProduct Owner: ${ado.po || "—"} · Stakeholders: ${ado.stakeholders || "—"} · ADO: ${ado.link || "—"}\nGenerated: ${new Date().toLocaleString("en-GB")} · Analysis engine: ${res.engine}`);
  out.push(`## 0. Role and deliverable\nYou are a senior product designer for ${cfg.productName}, working inside the ${ds.name} design system. ${AGENTS[agent]}`);
  if (inc.figma) out.push(`## 1. Figma target, source of truth and sitemap\n- Target file / branch: ${pipe.figmaUrl || "—"}\n- Source of truth for precedents: ${cfg.sotUrl || "—"}. Before designing a pattern, check the SOT for an existing screen that solves it and reuse it.\n- Journey node (Figma page): ${node}\n- Screens to build (journey node → ACs covered):\n${screens.map((s) => `- ${s.id}: ${s.acs.split("; ").map((a) => a.split(" ")[0]).join(", ")}`).join("\n") || `- ${nodeId}.1 …`}\n- Every frame, layer group and note references its J-node so the sitemap stays organic.`);
  if (inc.ds) out.push(`## 2. Design system rules · ${ds.name} (${RULES[ds.rule]?.label})\n${RULES[ds.rule]?.text}${ds.fallback ? `\n(This slot has no package yet: the files of “${ds.fallback}” below are the reference.)` : ""}\nNever invent color values or spacing outside the design system's scale.\n\n${ds.files.map((f) => `### ${f.path}\n${f.content.trim()}`).join("\n\n")}`);
  if (inc.prd) out.push(`## 3. Structured PRD (${cfg.template.name})\n${prdMD(cfg.template.sections, res.prd, ado).replace(/^# .*\n/, "")}`);
  if (inc.stories) out.push(`## 4. User stories and readiness\nProblem understanding (${res.ux.verdict}): ${res.ux.problem}\n\n${res.stories.map((s) => `- ${s.id} [${s.rating}] ${s.text}\n  Critique: ${s.critique}`).join("\n")}\n\nGaps to design around or flag:\n${res.ux.gaps.map((g) => `- [${g.severity}] ${g.category} – ${g.title}: ${g.detail} PO question: ${g.ask}${g.answer ? ` Proposed answer (unconfirmed): ${g.answer}` : ""}`).join("\n")}`);
  if (inc.validation) out.push(`## 5. Acceptance Criteria Validation Matrix\nPlace to the right of the Figma frames. Status values: Designed · Documented / Dev Note Only - No Comp Needed · Blocked.\n\n${validationMD(res.validation)}`);
  if (inc.drift) out.push(`## 6. System & Regional Drift Matrix\nPlace below the Validation Matrix.\n\n${driftMD(res.drift, res.driftColumns)}`);
  if (inc.board) out.push(`## 7. Review notes board\nStyle guide:\n${cfg.styleGuide}\n\n${reviewNotesMD(res.reviewNotes, res.validation)}`);
  out.push(`## 8. Definition of done\n- Every AC with status Designed has at least one frame named with its J-node.\n- Documented-only ACs appear as dev notes on the nearest frame.\n- Blocked ACs are listed in Review notes with the PO question; no frame is built for them.\n- No color-only meaning; contrast checked (WCAG 2.1 AA).\n- Matrices and Review notes board placed to the right of the frames, in the style guide format.`);
  return out.join("\n\n---\n\n");
}

const STEP_ICON = { todo: Circle, run: Loader2, ok: CheckCircle2, err: XCircle };
export const figmaLink = (url, pageId) => { const t = parseFigmaUrl(url); if (!t) return url; const base = String(url).split("?")[0]; return pageId ? `${base}?node-id=${pageId.replace(":", "-")}` : base; };

function FigmaBuild({ cfg, pipe, setPipe, res, mcp, ai, notify, onSitemap, startBuild, guard }) {
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  const job = jobStore.forPipeline(pipe.id);
  const running = job?.status === "running";
  const [confirm, setConfirm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState("");
  const [showCode, setShowCode] = useState(false);
  const target = parseFigmaUrl(pipe.figmaUrl);
  const ctx = pipe.figmaContext && target && pipe.figmaContext.fileKey === target.fileKey ? pipe.figmaContext : null;
  const sum = contextSummary(ctx);
  const autoName = draftPageName(pipe.journeyNode, pipe.ado, null, ctx?.sitemap);
  const pageName = pipe.draftName || autoName;
  const kids = ctx ? childPages(ctx.sitemap, pipe.journeyNode) : { anchor: null, children: [] };
  const draftPages = ctx ? ctx.sitemap.filter((p) => /\[draft\]/i.test(p.name)) : [];
  const refIds = pipe.figmaRefs?.length ? pipe.figmaRefs : draftPages.slice(0, 1).map((p) => p.id);
  const build = pipe.figmaBuild && pipe.figmaBuild.pageName === pageName ? pipe.figmaBuild : null;
  const say = (e) => (e?.code ? figmaErrorText(e) : String(e?.message || e));

  const analyze = async () => {
    if (!target) { setErr("Add the target Figma file / branch URL in Configuration first."); return; }
    if (!mcp) { setErr("This view can't reach a Figma connector. Open the app as a Claude artifact with the Figma connector connected."); return; }
    setErr(""); setAnalyzing(true);
    try {
      const sitemap = extractPages(await runInFigma(mcp, target.fileKey, SITEMAP_CODE, "Read-only: list pages to map the journey sitemap."));
      const node = sitemap.find((p) => p.name.replace(/^[↳\s]+/, "") === pipe.journeyNode.replace(/^[↳\s]+/, ""));
      const drafts = sitemap.filter((p) => /\[draft\]/i.test(p.name));
      const picks = (pipe.figmaRefs?.length ? pipe.figmaRefs : drafts.slice(0, 1).map((p) => p.id)).filter((id) => sitemap.some((p) => p.id === id));
      const ids = [...new Set([...picks, ...(node ? [node.id] : [])])].slice(0, 3);
      const refs = await Promise.all(ids.map((id) => runInFigma(mcp, target.fileKey, refPageCode(id), "Read-only: inspect how screens, components, styles and handoff are built on this page.").catch(() => null)));
      const merged = mergeContext(sitemap, refs, target.fileKey);
      setPipe({ figmaContext: merged, figmaRefs: picks, journeyNodeMissing: !node });
      const groups = pagesToGroups(sitemap.filter((p) => /^(↳\s*)?[A-Z]\d|^-{2,}/.test(p.name)).map((p) => p.name));
      if (groups.length) onSitemap?.(groups, sitemap.length);
      notify(`Figma file read · ${sitemap.length} pages, ${Object.keys(merged.exemplars).length} components`);
    } catch (e) { setErr(say(e)); }
    finally { setAnalyzing(false); }
  };

  const blockers = [!target && "Add the target Figma file / branch URL in Configuration.", !mcp && "Figma building needs the Figma connector, available when the app runs as a Claude artifact. Elsewhere, copy the master prompt below into an agent that has Figma access.", target && mcp && !ctx && "Read the Figma file first (step 1 below)."].filter(Boolean);
  const steps = job?.steps;
  const lastCode = job?.lastCode;
  return (
    <section aria-label="Build in Figma" className="rounded-lg border border-accent/40 bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><Figma size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Build in Figma</h3>
            <p className="max-w-[80ch] text-sm text-muted-strong">Reads the target file first: sitemap, a reference page, and how its screens, components, text styles, variables and handoff are built. Then creates a new [Draft] page under the selected node and builds the design the same way. The build runs in the background: you can keep working on other screens or ADOs.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {running && <Btn icon={Square} onClick={() => jobStore.stop(job.id)} disabled={job.stopping}>{job.stopping ? "Stopping after this step…" : "Stop"}</Btn>}
          <Btn variant="primary" icon={running ? Loader2 : Wand2} disabled={running || analyzing || blockers.length > 0} onClick={() => setConfirm(true)}>{running ? "Building in background…" : build?.docs ? "Build again as a new page" : "Generate design in Figma"}</Btn>
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">1 · Read the Figma file</p>
          <p className="text-xs text-muted">File <span className="font-mono text-fg">{target ? target.fileKey : "not set"}</span>{target?.branch ? " (branch)" : ""}</p>
          {ctx && (
            <Field label="Reference page (style example)">
              <select id="refPage" className={inputCls} value={refIds[0] || ""} onChange={(e) => { const v = e.target.value; guard("Changing the reference page", () => setPipe({ figmaRefs: v ? [v] : [] })); }}>
                <option value="">None</option>
                {ctx.sitemap.filter((p) => !/^-{2,}/.test(p.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <div><Btn size="sm" icon={analyzing ? Loader2 : RefreshCw} disabled={analyzing || !target || !mcp} onClick={() => guard("Reading the Figma file again", analyze)}>{ctx ? "Read again" : "Analyze Figma file"}</Btn></div>
          {sum && (
            <ul className="flex flex-col gap-0.5 text-xs">
              <li><span className="font-mono tabular-nums">{sum.pages}</span> pages in the sitemap · read {fmtDate(ctx.analyzedAt)}</li>
              <li>Read: {[...new Set(sum.refs)].join(" · ") || "—"}</li>
              <li>{sum.shell ? "Screen shell found (header, navigation, breadcrumb)" : <span className="text-warn-fg">No screen shell found: screens use library parts only</span>}</li>
              <li><span className="font-mono tabular-nums">{sum.components.length}</span> library components · <span className="font-mono tabular-nums">{new Set(sum.styles).size}</span> text styles · <span className="font-mono tabular-nums">{sum.vars}</span> variables</li>
              <li>Handoff cards: {sum.handoffCards.length ? sum.handoffCards.slice(0, 4).join(", ") + (sum.handoffCards.length > 4 ? "…" : "") : "none found"}</li>
              <li>Feature Card: {sum.featureCard ? "yes" : "no"}</li>
              {pipe.journeyNodeMissing && <li className="text-warn-fg">The selected journey node isn't a page in this file. The new page will go at the end.</li>}
            </ul>
          )}
          {sum && <details className="text-xs"><summary className="cursor-pointer text-muted hover:text-fg">Components found</summary><p className="mt-1 leading-relaxed">{sum.components.join(" · ")}</p></details>}
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">2 · New page</p>
          <Field label="Page name" hint={pipe.draftName ? <button className="underline" onClick={() => guard("Renaming the page being built", () => setPipe({ draftName: "" }))}>Use suggested name</button> : "Suggested from the node and the feature. Edit if needed."}>
            <input id="draftName" className={inputCls} value={pageName} onChange={(e) => { const v = e.target.value; guard("Renaming the page being built", () => setPipe({ draftName: v })); }} />
          </Field>
          <p className="text-xs text-muted-strong">Goes <span className="font-semibold">below “{pipe.journeyNode}”</span>{kids.children.length ? `, ordered by number among its ${kids.children.length} existing page${kids.children.length > 1 ? "s" : ""}` : ""}.</p>
          {kids.children.length > 0 && <ul className="text-[11px] text-muted">{kids.children.map((c) => <li key={c.id} className="truncate">{c.name}</li>)}</ul>}
          <p className="text-xs text-muted">Layout: Feature Card · {draftIdOf(pageName)} · Main design (3 screens per row) · Handoff · Comparison</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">3 · Generate</p>
          {blockers.length > 0 && <ul className="flex flex-col gap-1 text-xs text-warn-fg">{blockers.map((b) => <li key={b} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{b}</li>)}</ul>}
          {!steps && !blockers.length && <p className="text-xs text-muted">{build && !build.docs ? `A previous run stopped after ${build.done} batch${build.done === 1 ? "" : "es"}.` : `Takes several minutes with ${ai.label}: the AI plans the screens, then writes and builds them three at a time.`}</p>}
          {steps && (
            <ol className="flex flex-col gap-1" aria-live="polite">
              {steps.map((s, k) => { const I = STEP_ICON[s.status] || Circle; return (
                <li key={k} className="flex items-start gap-1.5 text-xs">
                  <I size={14} aria-hidden="true" className={`mt-px shrink-0 ${s.status === "run" ? "animate-spin text-accent" : s.status === "ok" ? "text-ok-fg" : s.status === "err" ? "text-bad-fg" : "text-muted"}`} />
                  <span className={s.status === "todo" ? "text-muted" : ""}>{s.label}{s.note ? <span className="text-muted"> · {s.note}</span> : null}</span>
                </li>); })}
            </ol>
          )}
          {job?.status === "error" && <p role="alert" className="rounded-md bg-bad-bg px-2 py-1.5 text-xs text-bad-fg">{job.error}</p>}
          {err && <p role="alert" className="rounded-md bg-bad-bg px-2 py-1.5 text-xs text-bad-fg">{err}</p>}
          <div className="mt-auto flex flex-wrap gap-1.5">
            {build && !build.docs && !running && <Btn size="sm" icon={RefreshCw} onClick={() => startBuild(pipe.id, { resume: true, autoDraftName: autoName })}>Resume</Btn>}
            {build?.pageId && <a href={figmaLink(pipe.figmaUrl, build.pageId)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-surface-2"><ExternalLink size={14} />Open page in Figma</a>}
            {lastCode && <Btn size="sm" icon={Code2} onClick={() => setShowCode(!showCode)}>{showCode ? "Hide" : "View"} last code</Btn>}
          </div>
        </div>
      </div>
      {showCode && lastCode && <pre className="mx-4 mb-4 max-h-96 overflow-auto rounded-md bg-code p-3 font-mono text-xs text-code-fg">{lastCode}</pre>}
      {confirm && (
        <Modal title="Generate design in Figma?" onClose={() => setConfirm(false)}
          footer={<><Btn onClick={() => setConfirm(false)}>Cancel</Btn><Btn variant="primary" icon={Wand2} onClick={() => { setConfirm(false); startBuild(pipe.id, { resume: false, autoDraftName: autoName }); }}>Create page and build</Btn></>}>
          <div className="flex flex-col gap-2 text-sm">
            <p>Creates the page <span className="font-semibold">{pageName}</span> below <span className="font-semibold">{pipe.journeyNode}</span> in file <span className="font-mono">{target?.fileKey}</span>, then builds the Feature Card, screens, Handoff and Comparison on it.</p>
            <p className="text-muted">Nothing outside the new page is changed. Screens reuse the components and styles of “{sum?.refs[0] || "the reference page"}”. The build continues in the background while you work elsewhere in the app; keep this browser tab open until it finishes.</p>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function Step4({ cfg, pipe, setPipe, res, notify, downloads, mcp, ai, onSitemap, startBuild, guard }) {
  const [inc, setInc] = useState({ figma: true, ds: true, prd: true, stories: true, validation: true, drift: true, board: true });
  const [agent, setAgent] = useState("Figma agent");
  const [fallback, setFallback] = useState(null);
  const prompt = useMemo(() => compile(cfg, pipe, res, inc, agent), [cfg, pipe, res, inc, agent]);
  const ado = pipe.ado;
  const slug = (ado.id || "ado").replace(/[^\w-]+/g, "-");
  const exp = (filename, data) => saveFile(downloads, filename, data, notify, setFallback);
  const exports = [
    ["Matrices (Markdown)", `${slug}-matrices.md`, () => `# ${ado.title}\n\n## Acceptance Criteria Validation Matrix\n\n${validationMD(res.validation)}\n\n## System & Regional Drift Matrix\n\n${driftMD(res.drift, res.driftColumns)}\n\n${reviewNotesMD(res.reviewNotes, res.validation)}\n`],
    ["Validation matrix (CSV)", `${slug}-validation-matrix.csv`, () => validationCSV(res.validation)],
    ["Drift matrix (CSV)", `${slug}-drift-matrix.csv`, () => driftCSV(res.drift, res.driftColumns)],
    ["Structured PRD (Markdown)", `${slug}-prd.md`, () => prdMD(cfg.template.sections, res.prd, ado)],
    ["Master prompt (Markdown)", `${slug}-master-prompt.md`, () => prompt],
  ];
  const opts = [["figma", "Figma target, SOT & journey nodes"], ["ds", `Design system rules (${activeDS(cfg).files.length} files)`], ["prd", "Structured PRD"], ["stories", "Stories & UX gaps"], ["validation", "Validation matrix"], ["drift", "Drift matrix"], ["board", "Review notes board + style guide"]];
  return (
    <div className="flex flex-col gap-6">
      <FigmaBuild cfg={cfg} pipe={pipe} setPipe={setPipe} res={res} mcp={mcp} ai={ai} notify={notify} onSitemap={onSitemap} startBuild={startBuild} guard={guard} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold">Target agent</h3>
            <div className="mt-2 flex flex-col gap-1">{Object.keys(AGENTS).map((a) => <label key={a} className="flex items-center gap-2 text-sm"><input type="radio" name="agent" checked={agent === a} onChange={() => setAgent(a)} className="accent-[rgb(var(--accent))]" />{a}</label>)}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold">Include</h3>
            <div className="mt-2 flex flex-col gap-1.5">{opts.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input id={`inc-${k}`} type="checkbox" checked={inc[k]} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} className="accent-[rgb(var(--accent))]" />{l}</label>)}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Download size={15} />Export</h3>
            <div className="mt-2 flex flex-col gap-1.5">{exports.map(([l, fn, gen]) => <Btn key={fn} size="sm" className="justify-start" onClick={() => exp(fn, gen())}>{l}</Btn>)}</div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted"><span className="font-mono tabular-nums text-fg">{prompt.length.toLocaleString()}</span> characters · about <span className="font-mono tabular-nums text-fg">{Math.round(prompt.length / 4).toLocaleString()}</span> tokens</p>
            <div className="flex flex-wrap gap-2">
              <Btn icon={Download} onClick={() => exp(`${slug}-matrices.md`, exports[0][2]())}>Export Matrices (Markdown / CSV)</Btn>
              <Btn variant="primary" icon={Copy} onClick={() => copyText(prompt, notify)}>Copy Master Prompt</Btn>
            </div>
          </div>
          <pre id="masterPrompt" tabIndex={0} className="h-[40rem] min-w-0 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-code p-4 font-mono text-xs leading-relaxed text-code-fg">{prompt}</pre>
        </div>
      </div>
      {fallback && (
        <Modal wide title={fallback.filename} onClose={() => setFallback(null)} footer={<><Btn onClick={() => setFallback(null)}>Close</Btn><Btn variant="primary" icon={Copy} onClick={() => copyText(fallback.data, notify)}>Copy</Btn></>}>
          <p className="mb-2 text-sm text-muted">File saving isn't available in this view. Copy the contents and save them as <span className="font-mono">{fallback.filename}</span>.</p>
          <pre className="whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-mono text-xs">{fallback.data}</pre>
        </Modal>
      )}
    </div>
  );
}

