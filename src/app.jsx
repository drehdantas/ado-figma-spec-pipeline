import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { GitCompare, ArrowLeft, ArrowRight, Plus, Loader2, CheckCircle2, XCircle, X, Copy, Figma, ClipboardPaste, MessageSquare } from "lucide-react";
import { Btn, Modal, Toast, Field, copyText, fmtDate } from "./ui.jsx";
import { localAnalyze, buildAnalysisPrompt, parseJSONLoose, normalize, repairPrompt, priorSummary } from "./engine.js";
import { Step2, Step3 } from "./steps23.jsx";
import { Step1 } from "./step1.jsx";
import { Step4, compile } from "./step4.jsx";
import { Sidebar, Dashboard, PipelinesList, Products, Workspace } from "./views.jsx";
import { team, useTeam, initTeam, initRoom, addActivity, pushPresence, statusOf, statusById } from "./team.js";
import { StatusMenu, AssigneePicker, PresenceBar, ActivityPanel, NameDialog, Avatar } from "./teamui.jsx";
import { ContextDrawer, saveFile, AICard } from "./drawer.jsx";
import { openStore } from "./store.js";
import { buildPdf } from "./pdf.js";
import { mdForPrompt, imageBlobs, imageRefs } from "./mdeditor.jsx";
import { DEFAULT_CONFIG, DEFAULT_NODE, DEFAULT_JOURNEY, PROFILE_KEYS, migrateConfig, activeDS, dsLabel, RULES, scopedConfig, pipeContext, productKey, cloneProfile, profileOf } from "./config.js";
import { makeAI } from "./ai.js";
import { jobStore, isRunning } from "./jobs.js";
import { runFigmaBuild, recordSnaps } from "./figma-runner.js";
import { protoTheme, renderScreens, wirePrompt, heuristicLinks, prototypeFile } from "./proto-render.js";
import { mergeSnaps, renderSnap, spriteOf } from "./proto-snap.js";
import { parseFigmaUrl, figmaErrorText } from "./figma.js";
import { relatedPipelines, historyForSection, suggestPrompt } from "./suggest.js";
import { DEMO_ADO, DEMO_ANALYSIS } from "./sample/demo.js";

const EMPTY_ADO = { id: "", link: "", po: "", stakeholders: "", title: "", raw: "", designerNotes: "", images: {} };
const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();
const newPipeline = (over = {}) => ({ status: "draft", assignee: null, activity: [], ctxV: 1, productName: "", sotUrl: "", journey: DEFAULT_JOURNEY, ownProfile: null, ado: EMPTY_ADO, res: null, step: 1, engine: "ai", figmaUrl: "", journeyNode: DEFAULT_NODE, analyzedRaw: "", figmaRuns: [], ...over, id: uid(), createdAt: now(), updatedAt: now() });
const SEED = { id: "example-store-locator", example: true, ctxV: 1, productName: "Example product", sotUrl: "", journey: DEFAULT_JOURNEY, createdAt: now(), updatedAt: now(), ado: { ...DEMO_ADO, stakeholders: "Jordan Lee (Engineering lead), Sam Park (Market A operations)" }, res: DEMO_ANALYSIS, step: 2, engine: "ai", figmaUrl: "", journeyNode: DEFAULT_NODE, analyzedRaw: DEMO_ADO.raw, figmaRuns: [] };

const STEPS = [
  { n: 1, label: "Raw ADO ingestion" },
  { n: 2, label: "Structured PRD & audit" },
  { n: 3, label: "Validation & drift matrices" },
  { n: 4, label: "Prompt compiler & Figma" },
];
function Stepper({ step, setStep, hasResult }) {
  return (
    <nav aria-label="Pipeline steps" className="overflow-x-auto">
      <ol className="flex min-w-max gap-1">
        {STEPS.map((s) => {
          const active = step === s.n, locked = s.n > 1 && !hasResult;
          return (
            <li key={s.n}>
              <button disabled={locked} onClick={() => setStep(s.n)} aria-current={active ? "step" : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${active ? "bg-accent text-accent-fg" : hasResult && s.n < 4 ? "bg-ok-bg text-ok-fg" : "bg-surface-2 text-muted"}`}>{s.n}</span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------------- Pipeline view ---------------- */
/* What the analysis was made from: the ADO text plus the designer comments, so editing either enables converting again. */
const analysisSig = (ado) => ado.raw + (ado.designerNotes?.trim() ? `\n\n[designer]\n${ado.designerNotes.trim()}` : "");

function PipelineView({ cfg: wcfg, setCfg, setAi, pipe, setPipe, all, caps, ai, notify, guard, startBuild, proto, loadProto, startPrototype }) {
  const t = useTeam();
  const log = (type, text) => setPipe((p) => ({ activity: addActivity(p, type, text) }));
  useEffect(() => { pushPresence({ pid: pipe.id, step: pipe.step }); }, [pipe.id, pipe.step]);
  useEffect(() => () => pushPresence({ pid: null, editingAt: 0 }), []);
  const [showAct, setShowAct] = useState(false);
  const [drawer, setDrawer] = useState(() => { try { return localStorage.getItem("adoPipeline.drawer") !== "0"; } catch { return true; } });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const ctl = useRef(null);
  useEffect(() => { try { localStorage.setItem("adoPipeline.drawer", drawer ? "1" : "0"); } catch {} }, [drawer]);
  /* Each pipeline has its own context. Product-level parts (PRD template, design system, style guide) are shared
     only with pipelines of the same product name; Figma target, source of truth and sitemap are always its own. */
  const cfg = scopedConfig(wcfg, pipe);
  useEffect(() => {
    if (pipe.ctxV) return;
    const pc = pipeContext(pipe, wcfg);
    setPipe({ ctxV: 1, ...pc, ownProfile: productKey(pc.productName) ? null : cloneProfile(profileOf(wcfg, pipe)) });
  }, [pipe.id]);
  const setScoped = (next) => {
    const pc = pipeContext(pipe, wcfg);
    const k = productKey(pc.productName);
    const patch = {};
    if (next.sotUrl !== cfg.sotUrl) patch.sotUrl = next.sotUrl;
    if (next.journey !== cfg.journey) patch.journey = next.journey;
    let w = wcfg;
    if (next.ai !== cfg.ai) setAi(next.ai);
    if (PROFILE_KEYS.some((key) => next[key] !== cfg[key]) && k && !t.admin) { notify("Only admins can change this product's PRD template, design system and style guide."); }
    else if (PROFILE_KEYS.some((key) => next[key] !== cfg[key])) {
      const prof = Object.fromEntries(PROFILE_KEYS.map((key) => [key, next[key]]));
      if (k) w = { ...w, products: { ...w.products, [k]: { ...(w.products?.[k] || {}), name: w.products?.[k]?.name || pc.productName.trim(), ...prof, updatedAt: now() } } };
      else patch.ownProfile = prof;
    }
    if (w !== wcfg) setCfg(w);
    if (Object.keys(patch).length) setPipe({ ctxV: 1, productName: pc.productName, sotUrl: pc.sotUrl, journey: pc.journey, ...patch });
  };
  const sameProduct = useMemo(() => {
    if (!cfg.productKey) return {};
    return Object.fromEntries(Object.entries(all).filter(([id, p]) => id !== pipe.id && productKey(pipeContext(p, wcfg).productName) === cfg.productKey));
  }, [all, cfg.productKey, pipe.id]);
  const productInfo = { names: Object.values(wcfg.products || {}).map((p) => p.name).filter(Boolean), shared: Object.keys(sameProduct).length, exists: !!wcfg.products?.[cfg.productKey] };
  /* Renaming the product: an existing name adopts that product's template and design system; a new name starts
     a new product from what this pipeline uses now; no name keeps a private copy for this pipeline only. */
  const setProductName = (raw) => {
    const name = String(raw || "").trim();
    const pc = pipeContext(pipe, wcfg);
    if (name === pc.productName.trim()) return;
    const k = productKey(name);
    const current = cloneProfile(profileOf(wcfg, pipe));
    const patch = { ctxV: 1, productName: name, sotUrl: pc.sotUrl, journey: pc.journey, ownProfile: k ? null : current };
    if (k && !wcfg.products?.[k] && !t.admin) { notify(`“${name}” isn't a product yet. Ask an admin to create it, or pick an existing one.`); return; }
    if (k && !wcfg.products?.[k]) { setCfg({ ...wcfg, products: { ...wcfg.products, [k]: { name, ...current, updatedAt: now() } } }); notify(`New product “${name}”. It starts with this pipeline's PRD template and design system.`); }
    else if (k) { const n = Object.values(all).filter((p) => p.id !== pipe.id && productKey(pipeContext(p, wcfg).productName) === k).length; notify(`Using the PRD template and design system of “${wcfg.products[k].name}”${n ? ` · shared with ${n} other pipeline${n > 1 ? "s" : ""}` : ""}`); }
    else notify("No product name: this pipeline keeps its own PRD template and design system.");
    setPipe(patch);
  };
  const { ado, res, step } = pipe;
  const engine = pipe.engine === "local" ? "local" : "ai";
  const setRes = (r) => setPipe({ res: r });
  const ds = activeDS(cfg);
  const cfgView = { ...cfg, dsName: dsLabel(cfg) };
  const ctx = () => ({ productName: cfg.productName, sections: cfg.template.sections, dsFiles: ds.files, dsName: ds.name, dsRule: ds.rule, dsRuleText: RULES[ds.rule]?.text, styleGuide: cfg.styleGuide, figmaUrl: pipe.figmaUrl, sotUrl: cfg.sotUrl, journeyNode: pipe.journeyNode, driftColumns: res?.driftColumns || { primary: "Primary market", variantA: "Variant A", variantB: "Variant B" } });
  const sig = analysisSig(ado);
  const upToDate = !!res && pipe.analyzedRaw === sig && !!ado.raw.trim();
  const g = (label, fn) => guard(pipe.id, label, fn);

  const [mx, setMx] = useState({ busy: false, progress: "" });
  const adoForPrompt = () => ({ ...ado, raw: mdForPrompt(ado.raw), designerNotes: mdForPrompt(ado.designerNotes || "", imageRefs(ado.raw).length) });
  const askJSON = async (prompt, opts) => {
    const text = await ai.ask(prompt, opts);
    try { return parseJSONLoose(text); }
    catch { return parseJSONLoose(await ai.ask(repairPrompt(text), { signal: opts.signal, title: "Fix the answer's JSON", tier: "default" })); }
  };
  /* Part 2: validation matrix, drift matrix and review notes, asked separately so they always arrive complete.
     Falls back to the local rules engine so step 3 is never empty. */
  const buildMatrices = async (base, adoText, signal, onProgress) => {
    try {
      const max = await ai.imageLimit().catch(() => 0);
      const imgs = max ? await imageBlobs(`${ado.raw}\n\n${ado.designerNotes || ""}`, ado.images, max) : [];
      const data = await askJSON(buildAnalysisPrompt(adoText, { ...ctx(), prior: priorSummary(base) }, "matrices") + (imgs.length ? `\n\nATTACHED IMAGES: ${imgs.length} image(s) from the ADO and the designer comments, in the order of the [Image n] markers above.` : ""), { images: imgs, signal, title: "Build the validation & drift matrices", onText: (t) => onProgress(`Writing the matrices… ${t.length.toLocaleString()} characters`) });
      const n = normalize({ ...base, ...data }, ctx());
      if (!n.validation.length) throw new Error("the answer had no matrix rows");
      return { validation: n.validation, drift: n.drift, driftColumns: n.driftColumns, reviewNotes: n.reviewNotes, matricesBy: ai.label };
    } catch (e) {
      if (e?.code === "cancelled") throw e;
      const loc = localAnalyze(adoText, ctx());
      return { validation: loc.validation, drift: loc.drift, driftColumns: loc.driftColumns, reviewNotes: loc.reviewNotes, matricesBy: `Local rules: the AI matrices failed (${e?.message || "unknown error"})` };
    }
  };
  const onMatrices = async () => {
    setMx({ busy: true, progress: "Building the matrices…" });
    ctl.current = new AbortController();
    try {
      const m = await buildMatrices(res, adoForPrompt(), ctl.current.signal, (t) => setMx({ busy: true, progress: t }));
      setPipe((p) => ({ res: { ...p.res, ...m } }));
      log("matrices", m.matricesBy); notify(`Matrices ready · ${m.validation.length} AC rows, ${m.drift.length} drift rows`);
    } catch (e) { if (e?.code !== "cancelled") notify(e?.message || "Couldn't build the matrices."); }
    finally { setMx({ busy: false, progress: "" }); }
  };

  const run = () => {
    setErr("");
    if (upToDate) { setPipe({ step: 2 }); return; }
    g("Converting the ADO again", async () => {
      if (ado.raw === DEMO_ADO.raw && !ado.designerNotes?.trim()) { setPipe({ res: DEMO_ANALYSIS, step: 2, analyzedRaw: sig }); return; }
      const adoText = adoForPrompt();
      if (engine === "local") { setPipe({ res: localAnalyze(adoText, ctx()), step: 2, analyzedRaw: sig }); log("converted", "local rules"); notify("Analyzed with local rules"); return; }
      setBusy(true); setProgress("Thinking…");
      ctl.current = new AbortController();
      try {
        const max = await ai.imageLimit();
        const imgs = max ? await imageBlobs(`${ado.raw}\n\n${ado.designerNotes || ""}`, ado.images, max) : [];
        if (imgs.length) setProgress(`Thinking… (${imgs.length} image${imgs.length > 1 ? "s" : ""} attached)`);
        const prompt = buildAnalysisPrompt(adoText, ctx()) + (imgs.length ? `\n\nATTACHED IMAGES: ${imgs.length} image(s) from the ADO and the designer comments, in the order of the [Image n] markers above. Read them as part of the work item.` : "");
        const data = await askJSON(prompt, { images: imgs, signal: ctl.current.signal, title: "Convert the ADO · 1 of 2 (PRD & audit)", onText: (t) => setProgress(t.length > 80 ? `1/2 · Writing PRD & audit… ${t.length.toLocaleString()} characters` : t) });
        const parsed = normalize(data, ctx());
        parsed.engine = ai.label;
        setProgress("2/2 · Building the validation & drift matrices…");
        const m = await buildMatrices(parsed, adoText, ctl.current.signal, (t) => setProgress(`2/2 · ${t}`));
        setPipe({ res: { ...parsed, ...m }, step: 2, analyzedRaw: sig }); log("converted", ai.label); notify(/^Local/.test(m.matricesBy) ? "Analysis ready · matrices from local rules" : "Analysis ready");
      } catch (e) {
        if (e?.code === "cancelled") setErr("Stopped. Nothing was changed.");
        else if (e?.code === "not_granted") { setErr("AI access was declined, so the local rules engine was used instead."); setPipe({ res: localAnalyze(adoText, ctx()), step: 2, analyzedRaw: sig }); }
        else setErr(`The AI's answer couldn't be read (${e?.message || "unknown error"}). Convert again: answers vary from run to run. If it keeps happening, shorten very long pasted content or switch to Local rules.`);
      } finally { setBusy(false); }
    });
  };

  const related = useMemo(() => (res ? relatedPipelines(pipe, sameProduct) : []), [pipe.id, ado.raw, ado.title, ado.po, ado.stakeholders, !!res, sameProduct]);
  const history = useMemo(() => {
    if (!res) return {};
    const out = {};
    for (const s of cfg.template.sections) { if ((res.prd[s.id]?.status || "missing") === "filled") continue; const h = historyForSection(s.id, related); if (h.length) out[s.id] = h; }
    return out;
  }, [res, related, cfg.template.sections]);

  const onSuggest = async () => {
    setSuggestBusy(true);
    try {
      const text = await ai.ask(suggestPrompt({ productName: cfg.productName, pipe, res, sections: cfg.template.sections, related }), { title: "Suggest answers", tier: "default" });
      const j = parseJSONLoose(text);
      const gaps = {};
      (j.gaps || []).forEach((x) => { if (x && Number.isInteger(x.index) && x.answer) gaps[x.index] = { answer: x.answer, confidence: x.confidence }; });
      setPipe((p) => ({ res: { ...p.res, suggestions: { sections: j.sections || {}, gaps, at: now(), by: ai.label } } }));
      notify(`Suggestions ready · ${Object.keys(j.sections || {}).length} sections, ${Object.keys(gaps).length} answers`);
    } catch (e) { notify(e?.message || "Couldn't get suggestions."); }
    finally { setSuggestBusy(false); }
  };

  const onPdf = async () => {
    setPdfBusy(true);
    try { await saveFile(caps.downloads, `${(ado.id || "ado").replace(/[^\w-]+/g, "-")}-po-review-pack.pdf`, buildPdf({ ado, res, sections: cfg.template.sections, poQuestions: res.ux.gaps }), notify); }
    catch (e) { notify("Couldn't build the PDF: " + (e.message || e)); }
    finally { setPdfBusy(false); }
  };

  return (
    <>
      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-gutter pb-16 pt-4">
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">{[cfg.productNameRaw || "No product", ado.id, ado.po && `PO ${ado.po}`].filter(Boolean).join(" · ")}</p>
              <h2 className="truncate text-lg font-semibold">{ado.title || "New ADO"}</h2>
              <p className="text-xs text-muted">{pipe.createdBy ? <>Created by {pipe.createdBy === t.me ? "you" : t.name(pipe.createdBy)}</> : "Created"} · {fmtDate(pipe.createdAt)}{pipe.updatedBy ? <> · last change by {pipe.updatedBy === t.me ? "you" : t.name(pipe.updatedBy)} {fmtDate(pipe.updatedAt)}</> : null}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusMenu status={statusOf(pipe)} disabled={!t.canWrite} onChange={(st) => setPipe((p) => ({ status: st, activity: addActivity(p, "status", `${statusById(statusOf(p)).label} → ${statusById(st).label}`) }))} />
              <AssigneePicker value={pipe.assignee} disabled={!t.canWrite} known={Object.values(all).flatMap((p) => [p.assignee, p.createdBy, p.updatedBy]).filter(Boolean)} onChange={(id) => setPipe((p) => ({ assignee: id, activity: addActivity(p, "assignee", id ? t.name(id) : "unassigned") }))} />
              <Btn size="sm" icon={MessageSquare} aria-expanded={showAct} onClick={() => setShowAct((v) => !v)}>Activity{(pipe.activity || []).length ? ` (${(pipe.activity || []).length})` : ""}</Btn>
            </div>
          </div>
          <PresenceBar pid={pipe.id} />
          {showAct && <ActivityPanel activity={pipe.activity || []} canWrite={t.canWrite} onNote={(text) => log("note", text)} />}
        </div>
        <ContextDrawer admin={t.admin} cfg={cfg} setCfg={setScoped} productInfo={productInfo} setProductName={setProductName} pipe={pipe} setPipe={setPipe} notify={notify} open={drawer} setOpen={setDrawer} caps={caps} guard={(label, fn) => (/design system|package/i.test(label) ? fn() : g(label, fn))} />
        <Stepper step={step} setStep={(n) => setPipe({ step: n })} hasResult={!!res} />
        <div>
          <h2 className="text-lg font-semibold">{STEPS[step - 1].label}</h2>
          <p className="text-sm text-muted">{[
            "Paste the raw work item. The PRD template and design system from Configuration are applied when you convert.",
            "The ADO mapped onto your PRD template, a critique of the stories, and suggested answers for what's missing.",
            "Discussion guide for the PO and the comparison across markets and design-system strictness. Everything is editable.",
            "Build the design in Figma, or copy one prompt that combines PRD, design rules, Figma context and matrices.",
          ][step - 1]}</p>
        </div>
        {step === 1 && <Step1 product={cfg.productNameRaw} productInfo={productInfo} setProductName={setProductName} ado={ado} setAdo={(a) => setPipe({ ado: a })} updAdo={(fn) => setPipe((p) => ({ ado: fn(p.ado) }))} engine={engine} setEngine={(e) => setPipe({ engine: e })} aiLabel={ai.label} run={run} busy={busy} progress={progress} stop={() => ctl.current?.abort()} err={err} upToDate={upToDate} assets={caps.assets} notify={notify} />}
        {step === 2 && res && <Step2 cfg={cfgView} ado={ado} res={res} setRes={setRes} notify={notify} onPdf={onPdf} pdfBusy={pdfBusy} history={history} onSuggest={onSuggest} suggestBusy={suggestBusy} aiLabel={ai.label} />}
        {step === 3 && res && <Step3 cfg={cfgView} res={res} setRes={setRes} onMatrices={onMatrices} mxBusy={mx.busy} mxProgress={mx.progress} aiLabel={ai.label} />}
        {step === 4 && res && <Step4 cfg={cfgView} pipe={pipe} setPipe={setPipe} res={res} notify={notify} downloads={caps.downloads} mcp={caps.mcp} ai={ai} startBuild={startBuild} guard={g} proto={proto} loadProto={loadProto} startPrototype={startPrototype}
          onSitemap={(groups, n) => setScoped({ ...cfg, journey: { groups, source: `Synced from target file · ${n} pages`, syncedAt: now() } })} />}
        {res && step > 1 && step < 4 && (
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Btn onClick={() => setPipe({ step: step - 1 })}>Back</Btn>
            <Btn variant="primary" icon={ArrowRight} onClick={() => setPipe({ step: step + 1 })}>Continue to {STEPS[step].label.toLowerCase()}</Btn>
          </div>
        )}
      </main>
    </>
  );
}

/* ---------------- Background job indicator (header) ---------------- */
function JobIndicator({ pipelines, onOpen }) {
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  const jobs = jobStore.all().filter((j) => j.status === "running" || !j.seen);
  if (!jobs.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-live="polite">
      {jobs.map((j) => {
        const done = j.steps.filter((s) => s.status === "ok").length;
        const proto = j.kind === "prototype";
        const p = pipelines[j.pipelineId];
        const label = p?.ado?.id || p?.ado?.title || j.title;
        const tone = j.status === "running" ? "border-accent/50 bg-accent-soft text-accent-strong" : j.status === "done" ? "border-line bg-ok-bg text-ok-fg" : "border-line bg-bad-bg text-bad-fg";
        const I = j.status === "running" ? Loader2 : j.status === "done" ? CheckCircle2 : XCircle;
        return (
          <span key={j.id} className={`inline-flex max-w-[22rem] items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-xs font-medium ${tone}`}>
            <I size={13} className={j.status === "running" ? "animate-spin" : ""} aria-hidden="true" />
            <button className="truncate pr-1.5 hover:underline" onClick={() => { onOpen(j.pipelineId); if (j.status !== "running") jobStore.update(j.id, { seen: true }); }}>
              {proto ? (j.status === "running" ? `Building prototype · ${label} · ${j.steps.find((s) => s.status === "run")?.note || ""}` : j.status === "done" ? `Prototype ready · ${label}` : j.status === "stopped" ? `Prototype stopped · ${label}` : `Prototype failed · ${label}`) : j.status === "running" ? `Building in Figma · ${label} · ${done}/${j.steps.length}${j.stopping ? " · stopping" : ""}` : j.status === "done" ? `Figma page ready · ${label}` : j.status === "stopped" ? `Figma build stopped · ${label}` : `Figma build failed · ${label}`}
            </button>
            {j.status !== "running" && <button aria-label="Dismiss" className="rounded-full p-0.5 hover:bg-surface/60" onClick={() => jobStore.update(j.id, { seen: true })}><X size={12} /></button>}
          </span>
        );
      })}
    </div>
  );
}

/* ---------------- Copy & paste bridge for any AI agent ---------------- */
function ManualModal({ req, onDone, notify }) {
  const [answer, setAnswer] = useState("");
  return (
    <Modal wide title={`Run this in your AI agent · ${req.title || "Prompt"}`} onClose={() => onDone(null)}
      footer={<><Btn onClick={() => onDone(null)}>Cancel</Btn><Btn variant="primary" icon={ClipboardPaste} disabled={!answer.trim()} onClick={() => onDone(answer)}>Use this answer</Btn></>}>
      <div className="flex flex-col gap-3">
        <ol className="list-decimal pl-5 text-sm text-muted-strong">
          <li>Copy the prompt and paste it into any AI agent (ChatGPT, Copilot, Gemini, Claude, a coding agent…).{req.imageCount ? ` Also attach the ${req.imageCount} image(s) from the ADO.` : ""}</li>
          <li>Paste the agent's full answer below.</li>
        </ol>
        <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">{req.prompt.length.toLocaleString()} characters</span><Btn size="sm" variant="primary" icon={Copy} onClick={() => copyText(req.prompt, notify)}>Copy prompt</Btn></div>
        <pre tabIndex={0} className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-code p-3 font-mono text-xs text-code-fg">{req.prompt}</pre>
        <Field label="Agent's answer"><textarea id="manualAnswer" className="h-48 w-full rounded-md border border-line bg-surface p-2 font-mono text-xs" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Paste the answer here (JSON or code, exactly as the agent wrote it)" /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- App ---------------- */
const LS_AI = "adoPipeline.ai";
const readAi = () => { try { return JSON.parse(localStorage.getItem(LS_AI) || "null"); } catch { return null; } };
const TRACKED = new Set();

function App() {
  const [store, setStore] = useState(null);
  const [cfg, setCfgState] = useState(DEFAULT_CONFIG);
  const [aiCfg, setAiState] = useState(() => readAi());
  const [pipelines, setPipelines] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState(() => { try { return localStorage.getItem("adoPipeline.view") || "dashboard"; } catch { return "dashboard"; } });
  const [filter, setFilter] = useState({});
  const [toast, setToast] = useState("");
  const [caps, setCaps] = useState({ sample: undefined, mcp: null, downloads: null, assets: null });
  const [manual, setManual] = useState([]);
  const [interrupt, setInterrupt] = useState(null);
  const [askName, setAskName] = useState(false);
  const t = useTeam();
  const cfgTimer = useRef(null);
  const latest = useRef({});
  const pending = useRef(new Map());
  const dirty = useRef({});
  const timers = useRef({});
  const storeRef = useRef(null);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const notify = (m) => { setToast(m); clearTimeout(notify.t); notify.t = setTimeout(() => setToast(""), 3600); };
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  useEffect(() => { try { localStorage.setItem("adoPipeline.view", view); } catch {} }, [view]);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const s = await openStore({ seed: SEED });
      setStore(s); storeRef.current = s;
      try { const c = await s.getConfig(); if (c) setCfgState(migrateConfig(c)); } catch {}
      unsub = s.subscribe((snap) => {
        setPipelines((prev) => {
          const next = { ...snap };
          for (const id of pending.current.keys()) if (prev[id]) next[id] = prev[id];
          latest.current = next;
          return next;
        });
        setLoading(false);
      }, () => setLoading(false));
    })();
    const use = window.claude?.use;
    if (!use) { setCaps({ sample: null, mcp: null, downloads: null, assets: null }); initTeam(null); }
    else {
      use("sample").then((x) => setCaps((c) => ({ ...c, sample: x || null }))).catch(() => setCaps((c) => ({ ...c, sample: null })));
      use("mcp").then((x) => setCaps((c) => ({ ...c, mcp: x || null }))).catch(() => {});
      use("downloads").then((x) => setCaps((c) => ({ ...c, downloads: x || null }))).catch(() => {});
      use("assets").then((x) => setCaps((c) => ({ ...c, assets: x || null }))).catch(() => {});
      use("user").then((x) => initTeam(x || null)).catch(() => initTeam(null));
      use("room").then((x) => initRoom(x || null)).catch(() => {});
    }
    const warn = (e) => { if (jobStore.running().length) { e.preventDefault(); e.returnValue = "A Figma page or prototype is still being built."; return e.returnValue; } };
    window.addEventListener("beforeunload", warn);
    return () => { unsub(); window.removeEventListener("beforeunload", warn); };
  }, []);
  /* Without sign-in, ask once for a display name. */
  useEffect(() => { if (t.ready && t.local && !t.me) setAskName(true); }, [t.ready]);

  /* Workspace settings (products) are shared; only admins write them. */
  const setCfg = (c) => {
    setCfgState(c); clearTimeout(cfgTimer.current);
    if (!team.admin) return;
    cfgTimer.current = setTimeout(() => storeRef.current?.saveConfig(c).catch(() => notify("Couldn't save the product settings (admins only).")), 900);
  };
  /* The AI provider is personal: kept in this browser, like the API keys. */
  const ai0 = aiCfg || cfg.ai || DEFAULT_CONFIG.ai;
  const setAi = (a) => { setAiState(a); try { localStorage.setItem(LS_AI, JSON.stringify(a)); } catch {} };

  /* One store for all pipelines: views and background jobs write through here. Only changed fields are sent. */
  const scheduleSave = (id) => {
    const seq = (pending.current.get(id) || 0) + 1;
    pending.current.set(id, seq);
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const doc = latest.current[id];
      const keys = [...(dirty.current[id] || [])]; dirty.current[id] = new Set();
      if (doc) { try { await storeRef.current?.savePipeline(doc, keys.length ? [...keys, "updatedAt", "updatedBy"] : null); } catch { notify("Couldn't save. Your changes stay on screen; check your connection."); } }
      if (pending.current.get(id) === seq) pending.current.delete(id);
    }, 800);
  };
  const updatePipe = (id, patch) => {
    const p = latest.current[id]; if (!p) return;
    let pp = typeof patch === "function" ? patch(p) : patch;
    const before = (p.figmaRuns || []).length;
    if (pp.figmaRuns && pp.figmaRuns.length > before) {
      const run = pp.figmaRuns[pp.figmaRuns.length - 1];
      if (run?.ok) pp = { ...pp, activity: addActivity({ ...p, ...pp }, "figma", run.page || ""), status: ["draft", "po_review", "approved"].includes(statusOf(p)) ? "in_design" : p.status };
    }
    const next = { ...latest.current, [id]: { ...p, ...pp, updatedAt: now(), updatedBy: team.me || p.updatedBy || null } };
    latest.current = next;
    setPipelines(next);
    const d = dirty.current[id] || (dirty.current[id] = new Set());
    Object.keys(pp).forEach((k) => d.add(k));
    scheduleSave(id);
  };
  const create = (over = {}) => {
    const p = newPipeline({ createdBy: team.me || null, assignee: team.me || null, ...over });
    p.activity = addActivity(p, "created", "");
    latest.current = { ...latest.current, [p.id]: p }; setPipelines(latest.current);
    storeRef.current?.savePipeline(p).catch(() => {}); setOpenId(p.id);
  };
  const remove = (id) => {
    jobStore.running().filter((j) => j.pipelineId === id).forEach((j) => jobStore.stop(j.id));
    pending.current.delete(id); clearTimeout(timers.current[id]);
    const n = { ...latest.current }; delete n[id]; latest.current = n; setPipelines(n);
    storeRef.current?.deletePipeline(id).catch(() => notify("Couldn't delete. Try again."));
    notify("Pipeline deleted");
  };

  const manualBridge = (req) => new Promise((resolve, reject) => setManual((q) => [...q, { ...req, resolve, reject }]));
  const ai = useMemo(() => makeAI({ aiCfg: ai0, caps, manualBridge }), [ai0, caps]);

  const guard = (pid, label, proceed) => {
    const job = jobStore.running().find((j) => j.pipelineId === pid && (j.kind || "figma") === "figma");
    if (!job) { proceed(); return; }
    setInterrupt({ label, proceed, job });
  };
  const saveSnapFor = (pid) => (id, data) => storeRef.current?.saveDoc("snaps", `${pid}__${id}`, data);
  const scoped = (pid) => { const sc = scopedConfig({ ...cfgRef.current, ai: ai0 }, latest.current[pid]); return { ...sc, dsName: dsLabel(sc) }; };
  const startBuild = (pid, { resume, autoDraftName }) => {
    if (isRunning(pid, "figma")) return;
    updatePipe(pid, { autoDraftName });
    const cfgNow = scoped(pid);
    runFigmaBuild({
      pipelineId: pid, resume, cfg: cfgNow, ai, mcp: caps.mcp, notify,
      getPipe: (id) => latest.current[id], updatePipe, saveSnap: saveSnapFor(pid),
      notesImages: async () => { const a = latest.current[pid]?.ado || {}; const max = await ai.imageLimit().catch(() => 0); return max ? imageBlobs(a.designerNotes || "", a.images, Math.min(max, 4)) : []; },
      compileBrief: () => compile(cfgNow, latest.current[pid], latest.current[pid].res, { figma: true, ds: false, dsDigest: true, prd: true, stories: true, validation: true, drift: true, board: false }, "Figma agent"),
    });
  };

  /* Navigable prototype of the Figma result: the saved screen code is replayed as HTML (no Figma calls),
     one short AI call wires the navigation. Saved per pipeline. */
  const [protos, setProtos] = useState({});
  const protosRef = useRef(protos); protosRef.current = protos;
  const loadProto = async (pid) => {
    if (protosRef.current[pid] !== undefined) return;
    let d = null; try { d = await storeRef.current?.getDoc("prototypes", pid); } catch {}
    setProtos((p) => (p[pid] !== undefined ? p : { ...p, [pid]: d?.html ? d : null }));
  };
  const startPrototype = (pid, opts = {}) => {
    if (isRunning(pid, "prototype")) return;
    const pipe = latest.current[pid]; const build0 = pipe?.figmaBuild; if (!build0?.plan) return;
    const sc = scoped(pid);
    const steps = [...(opts.capture ? [{ label: "Record the screens from the Figma page", status: "run" }] : []), { label: "Rebuild the screens as HTML", status: opts.capture ? "todo" : "run" }, { label: "Wire the navigation", status: "todo" }, { label: "Build the file", status: "todo" }];
    const job = jobStore.start({ id: "proto-" + pid + "-" + Date.now(), kind: "prototype", pipelineId: pid, title: pipe.ado?.id || pipe.ado?.title || "Prototype", steps });
    const o = opts.capture ? 1 : 0;
    (async () => {
      try {
        if (opts.capture) {
          const fk = parseFigmaUrl(pipe.figmaUrl)?.fileKey;
          if (!caps.mcp || !fk) throw new Error("Figma isn't connected in this view.");
          const st = await recordSnaps({
            mcp: caps.mcp, fileKey: fk, pageId: build0.pageId, mainId: build0.mainId, first: null, list: null,
            state: { ...build0, snapParts: [], snapKnown: { s: [], c: [] }, snapIds: [] },
            save: (patch) => updatePipe(pid, (p) => ({ figmaBuild: { ...p.figmaBuild, ...patch } })),
            saveSnap: saveSnapFor(pid), onNote: (t) => jobStore.step(job.id, 0, { note: t }),
          });
          jobStore.step(job.id, 0, { status: "ok", note: `${(st.snapIds || []).length} screens recorded` });
          jobStore.step(job.id, 1, { status: "run" });
        }
        const build = latest.current[pid]?.figmaBuild || build0;
        const theme = protoTheme(pipe.figmaContext || {});
        const productName = sc.productName || "Product";
        /* Screens recorded from Figma are exact; any others are redrawn from the saved code or the plan. */
        let parts = [];
        if (build.snapParts?.length) parts = await Promise.all(build.snapParts.map((id) => storeRef.current?.getDoc("snaps", `${pid}__${id}`).catch(() => null)));
        const snaps = mergeSnaps(parts, build.plan);
        const exact = snaps.screens.map((x) => renderSnap(x, snaps.chrome));
        const have = new Set(exact.map((x) => x.id));
        let rest = { screens: [], notes: [] };
        if ((build.plan || []).some((p) => !have.has(p.id))) { rest = await renderScreens({ build, theme, productName }); rest.screens = rest.screens.filter((x) => !have.has(x.id)); }
        const order = (build.plan || []).map((p) => p.id);
        const screens = [...exact, ...rest.screens].sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
        const source = exact.length && !rest.screens.length ? "exact copy of the Figma screens" : exact.length ? `${exact.length} screens copied from Figma, ${rest.screens.length} redrawn` : rest.source;
        jobStore.step(job.id, o, { status: "ok", note: `${screens.length} screens · ${screens.reduce((a, x) => a + x.hotspots.length, 0)} clickable elements · ${source}` });
        jobStore.step(job.id, o + 1, { status: "run", note: `Asking ${ai.label}…` });
        let wiring = null, by = ai.label;
        try { const j = parseJSONLoose(await ai.ask(wirePrompt(screens, build.plan, mdForPrompt(pipe.ado?.designerNotes || "")), { title: "Wire the prototype's navigation", tier: "default" })); if (Array.isArray(j?.links)) wiring = j; } catch (e) { if (e?.code === "cancelled") throw e; }
        if (!wiring) { wiring = { start: screens[0]?.id, links: heuristicLinks(screens) }; by = "rules"; }
        const ids = new Set(screens.map((x) => x.id));
        const links = wiring.links.filter((l) => ids.has(l.s) && Number.isInteger(l.h) && (l.back || l.toast || ids.has(l.to)));
        jobStore.step(job.id, o + 1, { status: "ok", note: `${links.length} interactions · ${by}` });
        const title = (build.pageName || pipe.ado?.title || "Prototype").replace(/^[↳\s]+/, "").replace(/\s*\[Draft\]\s*$/, "");
        const fonts = [...new Set(exact.flatMap((x) => x.fonts || []))];
        const html = prototypeFile({ title, productName, figmaPage: build.pageName, screens, links, start: ids.has(wiring.start) ? wiring.start : screens[0]?.id, theme, source, sprite: spriteOf(snaps.svg), fonts });
        const doc = { html, screens: screens.length, exact: exact.length, links: links.length, by, source, notes: rest.notes, at: now() };
        jobStore.step(job.id, o + 2, { status: "ok" }); jobStore.update(job.id, { status: "done" });
        setProtos((p) => ({ ...p, [pid]: doc }));
        updatePipe(pid, (p) => ({ activity: addActivity(p, "prototype", `${screens.length} screens`) }));
        storeRef.current?.saveDoc("prototypes", pid, doc)?.catch?.(() => {});
        notify("Prototype ready");
      } catch (e) {
        jobStore.update(job.id, { status: e?.code === "cancelled" ? "stopped" : "error", error: `Couldn't build the prototype: ${e?.code ? figmaErrorText(e) : e?.message || e}` });
      }
    })();
  };

  /* Backup and move: one JSON file with every pipeline and the product settings. */
  const onExport = async () => {
    const data = { app: "ado-figma-spec-pipeline", version: 2, exportedAt: now(), config: { ...cfg, ai: undefined }, pipelines: latest.current };
    await saveFile(caps.downloads, `spec-pipeline-workspace-${now().slice(0, 10)}.json`, JSON.stringify(data, null, 1), notify);
  };
  const onImport = async (file) => {
    let data; try { data = JSON.parse(await file.text()); } catch { notify("That file isn't a workspace export."); return; }
    if (!data?.pipelines || typeof data.pipelines !== "object") { notify("That file has no pipelines."); return; }
    let n = 0;
    for (const p of Object.values(data.pipelines)) {
      if (!p?.id) continue;
      const cur = latest.current[p.id];
      if (cur && String(cur.updatedAt) >= String(p.updatedAt)) continue;
      const doc = { ...p, activity: addActivity(p, "imported", "") };
      latest.current = { ...latest.current, [p.id]: doc };
      try { await storeRef.current?.savePipeline(doc); n++; } catch {}
    }
    setPipelines(latest.current);
    if (data.config && team.admin) {
      const c = migrateConfig(data.config);
      const merged = { ...cfg, products: { ...(c.products || {}), ...(cfg.products || {}) }, legacy: cfg.legacy || c.legacy };
      setCfg(merged);
    }
    notify(`Imported ${n} pipeline${n === 1 ? "" : "s"}${data.config && team.admin ? " and the product settings" : ""}.`);
  };

  const open = pipelines[openId];
  const openPipe = (id) => { setOpenId(id); updatePipe(id, { step: 4 }); };
  const counts = { pipelines: Object.keys(pipelines).length, products: Object.keys(cfg.products || {}).length };
  const viewUpdate = (patch) => { updatePipe(openId, patch); pushPresence({ pid: openId, editingAt: Date.now() }); };
  return (
    <div className="min-h-full">
      <header className="sticky z-30 border-b border-line bg-surface/95 backdrop-blur" style={{ top: "env(safe-area-inset-top,0px)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-gutter py-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setOpenId(null)}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><GitCompare size={17} aria-hidden="true" /></span>
            <span className="min-w-0"><h1 className="truncate text-[15px] font-semibold leading-tight">ADO → Figma Spec Pipeline</h1><span className="block text-[11px] text-muted">Team workspace</span></span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <JobIndicator pipelines={pipelines} onOpen={openPipe} />
            {openId && <Btn size="sm" icon={Plus} onClick={() => create({ productName: open ? pipeContext(open, cfg).productName : "" })}>New ADO</Btn>}
            <button onClick={() => { setOpenId(null); setView("workspace"); }} aria-label="Your profile and workspace" className="rounded-full">{t.me ? <Avatar id={t.me} size={28} /> : <span className="text-xs text-muted">Set name</span>}</button>
          </div>
        </div>
      </header>
      <div className="flex flex-col lg:flex-row">
        <Sidebar view={openId ? "pipelines" : view} setView={(v) => { setOpenId(null); setView(v); }} counts={counts} />
        {openId && open ? (
          <div className="min-w-0 flex-1">
            <nav aria-label="Breadcrumb" className="mx-auto flex max-w-7xl min-w-0 items-center gap-1.5 px-gutter pt-3 text-sm">
              <button onClick={() => setOpenId(null)} className="flex items-center gap-1 text-muted hover:text-fg"><ArrowLeft size={14} />Spec pipelines</button>
              <span className="text-muted">/</span>
              <span className="truncate font-medium">{open.ado.id || open.ado.title || "New ADO"}</span>
              {isRunning(open.id, "figma") && <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent-strong"><Figma size={12} />Figma build running</span>}
            </nav>
            <PipelineView key={openId} cfg={{ ...cfg, ai: ai0 }} setCfg={(c) => setCfg({ ...c, ai: cfgRef.current.ai })} setAi={setAi} pipe={open} setPipe={viewUpdate} all={pipelines} caps={caps} ai={ai} notify={notify} guard={guard} startBuild={startBuild} proto={protos[openId]} loadProto={loadProto} startPrototype={startPrototype} />
          </div>
        ) : view === "dashboard" ? (
          <Dashboard cfg={cfg} pipelines={pipelines} onOpen={setOpenId} onNew={() => create()} setView={setView} setFilter={setFilter} />
        ) : view === "products" ? (
          <Products cfg={cfg} pipelines={pipelines} onOpen={setOpenId} onNew={(o) => create(o)} setView={setView} setFilter={setFilter} />
        ) : view === "workspace" ? (
          <Workspace cfg={cfg} pipelines={pipelines} storeMode={store?.mode} onExport={onExport} onImport={onImport} onName={() => setAskName(true)}
            aiCard={<div className="max-w-3xl"><AICard cfg={{ ...cfg, ai: ai0 }} setCfg={(c) => setAi(c.ai)} caps={caps} /></div>} />
        ) : (
          <PipelinesList cfg={cfg} pipelines={pipelines} loading={loading} storeMode={store?.mode} onOpen={setOpenId} onNew={() => create()} filter={filter} setFilter={setFilter}
            onDuplicate={(p) => create({ ...JSON.parse(JSON.stringify(p)), example: false, ado: { ...p.ado, title: `${p.ado?.title || "Untitled"} (copy)` }, figmaRuns: [], figmaBuild: null, activity: [], status: "draft" })}
            onDelete={remove} />
        )}
      </div>
      {askName && <NameDialog onClose={() => setAskName(false)} />}
      {manual[0] && <ManualModal key={manual[0].prompt.length + (manual[0].title || "")} req={manual[0]} notify={notify} onDone={(answer) => { const r = manual[0]; setManual((q) => q.slice(1)); answer ? r.resolve(answer) : r.reject(Object.assign(new Error("Cancelled."), { code: "cancelled" })); }} />}
      {interrupt && (
        <Modal title="Stop the Figma build?" onClose={() => setInterrupt(null)}
          footer={<><Btn onClick={() => setInterrupt(null)}>Keep building</Btn><Btn variant="danger" onClick={() => { jobStore.stop(interrupt.job.id); const p = interrupt.proceed; setInterrupt(null); p(); }}>Stop build and continue</Btn></>}>
          <p className="text-sm">A Figma page is being built for <span className="font-semibold">{interrupt.job.title}</span>. {interrupt.label} would interrupt it. The current step finishes, then the build stops. You can resume it later from step 4.</p>
        </Modal>
      )}
      <Toast msg={toast} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
