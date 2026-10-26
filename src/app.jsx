import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { GitCompare, ArrowLeft, ArrowRight, Plus, Loader2, CheckCircle2, XCircle, X, Copy, Figma, ClipboardPaste } from "lucide-react";
import { Btn, Modal, Toast, Field, copyText } from "./ui.jsx";
import { localAnalyze, buildAnalysisPrompt, parseJSONLoose, normalize } from "./engine.js";
import { Step2, Step3 } from "./steps23.jsx";
import { Step1 } from "./step1.jsx";
import { Step4, compile } from "./step4.jsx";
import { Home } from "./home.jsx";
import { ContextDrawer, saveFile } from "./drawer.jsx";
import { openStore } from "./store.js";
import { buildPdf } from "./pdf.js";
import { mdForPrompt, imageBlobs } from "./mdeditor.jsx";
import { DEFAULT_CONFIG, DEFAULT_NODE, migrateConfig, activeDS, dsLabel, RULES } from "./config.js";
import { makeAI } from "./ai.js";
import { jobStore, isRunning } from "./jobs.js";
import { runFigmaBuild } from "./figma-runner.js";
import { relatedPipelines, historyForSection, suggestPrompt } from "./suggest.js";
import { DEMO_ADO, DEMO_ANALYSIS } from "./sample/demo.js";

const EMPTY_ADO = { id: "", link: "", po: "", stakeholders: "", title: "", raw: "", images: {} };
const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();
const newPipeline = (over = {}) => ({ ado: EMPTY_ADO, res: null, step: 1, engine: "ai", figmaUrl: "", journeyNode: DEFAULT_NODE, analyzedRaw: "", figmaRuns: [], ...over, id: uid(), createdAt: now(), updatedAt: now() });
const SEED = { id: "example-store-locator", example: true, createdAt: now(), updatedAt: now(), ado: { ...DEMO_ADO, stakeholders: "Jordan Lee (Engineering lead), Sam Park (Market A operations)" }, res: DEMO_ANALYSIS, step: 2, engine: "ai", figmaUrl: "", journeyNode: DEFAULT_NODE, analyzedRaw: DEMO_ADO.raw, figmaRuns: [] };

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
function PipelineView({ cfg, setCfg, pipe, setPipe, all, caps, ai, notify, guard, startBuild }) {
  const [drawer, setDrawer] = useState(() => { try { return localStorage.getItem("adoPipeline.drawer") !== "0"; } catch { return true; } });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const ctl = useRef(null);
  useEffect(() => { try { localStorage.setItem("adoPipeline.drawer", drawer ? "1" : "0"); } catch {} }, [drawer]);
  const { ado, res, step } = pipe;
  const engine = pipe.engine === "local" ? "local" : "ai";
  const setRes = (r) => setPipe({ res: r });
  const ds = activeDS(cfg);
  const cfgView = { ...cfg, dsName: dsLabel(cfg) };
  const ctx = () => ({ productName: cfg.productName, sections: cfg.template.sections, dsFiles: ds.files, dsName: ds.name, dsRule: ds.rule, dsRuleText: RULES[ds.rule]?.text, styleGuide: cfg.styleGuide, figmaUrl: pipe.figmaUrl, sotUrl: cfg.sotUrl, journeyNode: pipe.journeyNode, driftColumns: res?.driftColumns || { primary: "Primary market", variantA: "Variant A", variantB: "Variant B" } });
  const upToDate = !!res && pipe.analyzedRaw === ado.raw && !!ado.raw.trim();
  const g = (label, fn) => guard(pipe.id, label, fn);

  const run = () => {
    setErr("");
    if (upToDate) { setPipe({ step: 2 }); return; }
    g("Converting the ADO again", async () => {
      if (ado.raw === DEMO_ADO.raw) { setPipe({ res: DEMO_ANALYSIS, step: 2, analyzedRaw: ado.raw }); return; }
      const adoText = { ...ado, raw: mdForPrompt(ado.raw) };
      if (engine === "local") { setPipe({ res: localAnalyze(adoText, ctx()), step: 2, analyzedRaw: ado.raw }); notify("Analyzed with local rules"); return; }
      setBusy(true); setProgress("Thinking…");
      ctl.current = new AbortController();
      try {
        const max = await ai.imageLimit();
        const imgs = max ? await imageBlobs(ado.raw, ado.images, max) : [];
        if (imgs.length) setProgress(`Thinking… (${imgs.length} image${imgs.length > 1 ? "s" : ""} attached)`);
        const prompt = buildAnalysisPrompt(adoText, ctx()) + (imgs.length ? `\n\nATTACHED IMAGES: ${imgs.length} image(s) from the ADO, in the order of the [Image n] markers above. Read them as part of the work item.` : "");
        const text = await ai.ask(prompt, { images: imgs, signal: ctl.current.signal, title: "Convert the ADO", onText: (t) => setProgress(t.length > 80 ? `Writing analysis… ${t.length.toLocaleString()} characters` : t) });
        const parsed = normalize(parseJSONLoose(text), ctx());
        parsed.engine = ai.label;
        setPipe({ res: parsed, step: 2, analyzedRaw: ado.raw }); notify("Analysis ready");
      } catch (e) {
        if (e?.code === "cancelled") setErr("Stopped. Nothing was changed.");
        else if (e?.code === "not_granted") { setErr("AI access was declined, so the local rules engine was used instead."); setPipe({ res: localAnalyze(adoText, ctx()), step: 2, analyzedRaw: ado.raw }); }
        else setErr(`${e?.message || "The AI answer couldn't be used."} Try again, or switch to Local rules.`);
      } finally { setBusy(false); }
    });
  };

  const related = useMemo(() => (res ? relatedPipelines(pipe, all) : []), [pipe.id, ado.raw, ado.title, ado.po, ado.stakeholders, !!res, Object.keys(all).length]);
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
      <ContextDrawer cfg={cfg} setCfg={setCfg} pipe={pipe} setPipe={setPipe} notify={notify} open={drawer} setOpen={setDrawer} caps={caps} guard={(label, fn) => (/design system|package/i.test(label) ? fn() : g(label, fn))} />
      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-gutter pb-16 pt-4">
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
        {step === 1 && <Step1 ado={ado} setAdo={(a) => setPipe({ ado: a })} updAdo={(fn) => setPipe((p) => ({ ado: fn(p.ado) }))} engine={engine} setEngine={(e) => setPipe({ engine: e })} aiLabel={ai.label} run={run} busy={busy} progress={progress} stop={() => ctl.current?.abort()} err={err} upToDate={upToDate} assets={caps.assets} notify={notify} />}
        {step === 2 && res && <Step2 cfg={cfgView} ado={ado} res={res} setRes={setRes} notify={notify} onPdf={onPdf} pdfBusy={pdfBusy} history={history} onSuggest={onSuggest} suggestBusy={suggestBusy} aiLabel={ai.label} />}
        {step === 3 && res && <Step3 cfg={cfgView} res={res} setRes={setRes} />}
        {step === 4 && res && <Step4 cfg={cfgView} pipe={pipe} setPipe={setPipe} res={res} notify={notify} downloads={caps.downloads} mcp={caps.mcp} ai={ai} startBuild={startBuild} guard={g}
          onSitemap={(groups, n) => setCfg({ ...cfg, journey: { groups, source: `Synced from target file · ${n} pages`, syncedAt: now() } })} />}
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
        const p = pipelines[j.pipelineId];
        const label = p?.ado?.id || p?.ado?.title || j.title;
        const tone = j.status === "running" ? "border-accent/50 bg-accent-soft text-accent-strong" : j.status === "done" ? "border-line bg-ok-bg text-ok-fg" : "border-line bg-bad-bg text-bad-fg";
        const I = j.status === "running" ? Loader2 : j.status === "done" ? CheckCircle2 : XCircle;
        return (
          <span key={j.id} className={`inline-flex max-w-[22rem] items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-xs font-medium ${tone}`}>
            <I size={13} className={j.status === "running" ? "animate-spin" : ""} aria-hidden="true" />
            <button className="truncate pr-1.5 hover:underline" onClick={() => { onOpen(j.pipelineId); if (j.status !== "running") jobStore.update(j.id, { seen: true }); }}>
              {j.status === "running" ? `Building in Figma · ${label} · ${done}/${j.steps.length}${j.stopping ? " · stopping" : ""}` : j.status === "done" ? `Figma page ready · ${label}` : j.status === "stopped" ? `Figma build stopped · ${label}` : `Figma build failed · ${label}`}
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
function App() {
  const [store, setStore] = useState(null);
  const [cfg, setCfgState] = useState(DEFAULT_CONFIG);
  const [pipelines, setPipelines] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState("");
  const [caps, setCaps] = useState({ sample: undefined, mcp: null, downloads: null, assets: null });
  const [manual, setManual] = useState([]);
  const [interrupt, setInterrupt] = useState(null);
  const cfgTimer = useRef(null);
  const latest = useRef({});
  const pending = useRef(new Map());
  const timers = useRef({});
  const storeRef = useRef(null);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const notify = (m) => { setToast(m); clearTimeout(notify.t); notify.t = setTimeout(() => setToast(""), 3200); };
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);

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
    if (!use) setCaps({ sample: null, mcp: null, downloads: null, assets: null });
    else {
      use("sample").then((x) => setCaps((c) => ({ ...c, sample: x || null }))).catch(() => setCaps((c) => ({ ...c, sample: null })));
      use("mcp").then((x) => setCaps((c) => ({ ...c, mcp: x || null }))).catch(() => {});
      use("downloads").then((x) => setCaps((c) => ({ ...c, downloads: x || null }))).catch(() => {});
      use("assets").then((x) => setCaps((c) => ({ ...c, assets: x || null }))).catch(() => {});
    }
    const warn = (e) => { if (jobStore.running().length) { e.preventDefault(); e.returnValue = "A Figma page is still being built."; return e.returnValue; } };
    window.addEventListener("beforeunload", warn);
    return () => { unsub(); window.removeEventListener("beforeunload", warn); };
  }, []);

  const setCfg = (c) => { setCfgState(c); clearTimeout(cfgTimer.current); cfgTimer.current = setTimeout(() => storeRef.current?.saveConfig(c).catch(() => notify("Couldn't save settings")), 900); };

  /* One store for all pipelines: views and background jobs write through here. */
  const scheduleSave = (id) => {
    const seq = (pending.current.get(id) || 0) + 1;
    pending.current.set(id, seq);
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const doc = latest.current[id];
      if (doc) { try { await storeRef.current?.savePipeline(doc); } catch { notify("Couldn't save. Your changes stay on screen; check your connection."); } }
      if (pending.current.get(id) === seq) pending.current.delete(id);
    }, 800);
  };
  const updatePipe = (id, patch) => {
    const p = latest.current[id]; if (!p) return;
    const pp = typeof patch === "function" ? patch(p) : patch;
    const next = { ...latest.current, [id]: { ...p, ...pp, updatedAt: now() } };
    latest.current = next;
    setPipelines(next);
    scheduleSave(id);
  };
  const create = (over) => { const p = newPipeline(over); latest.current = { ...latest.current, [p.id]: p }; setPipelines(latest.current); storeRef.current?.savePipeline(p).catch(() => {}); setOpenId(p.id); };
  const remove = (id) => {
    const run = jobStore.running().find((j) => j.pipelineId === id); if (run) jobStore.stop(run.id);
    pending.current.delete(id); clearTimeout(timers.current[id]);
    const n = { ...latest.current }; delete n[id]; latest.current = n; setPipelines(n);
    storeRef.current?.deletePipeline(id).catch(() => notify("Couldn't delete. Try again."));
    notify("Pipeline deleted");
  };

  const manualBridge = (req) => new Promise((resolve, reject) => setManual((q) => [...q, { ...req, resolve, reject }]));
  const ai = useMemo(() => makeAI({ aiCfg: cfg.ai, caps, manualBridge }), [cfg.ai, caps]);

  const guard = (pid, label, proceed) => {
    const job = jobStore.running().find((j) => j.pipelineId === pid);
    if (!job) { proceed(); return; }
    setInterrupt({ label, proceed, job });
  };
  const startBuild = (pid, { resume, autoDraftName }) => {
    if (isRunning(pid)) return;
    updatePipe(pid, { autoDraftName });
    const cfgNow = { ...cfgRef.current, dsName: dsLabel(cfgRef.current) };
    runFigmaBuild({
      pipelineId: pid, resume, cfg: cfgNow, ai, mcp: caps.mcp, notify,
      getPipe: (id) => latest.current[id], updatePipe,
      compileBrief: () => compile(cfgNow, latest.current[pid], latest.current[pid].res, { figma: true, ds: false, prd: true, stories: true, validation: true, drift: true, board: false }, "Figma agent"),
    });
  };

  const open = pipelines[openId];
  const openPipe = (id) => { setOpenId(id); updatePipe(id, { step: 4 }); };
  return (
    <div className="min-h-full">
      <header className="sticky z-30 border-b border-line bg-surface/95 backdrop-blur" style={{ top: "env(safe-area-inset-top,0px)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-gutter py-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setOpenId(null)}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><GitCompare size={17} aria-hidden="true" /></span>
            <h1 className="truncate text-[15px] font-semibold">ADO → Figma Spec Pipeline</h1>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <JobIndicator pipelines={pipelines} onOpen={openPipe} />
            {openId && (<>
              <Btn size="sm" icon={ArrowLeft} onClick={() => setOpenId(null)}>All pipelines</Btn>
              <Btn size="sm" icon={Plus} onClick={() => create()}>Clear / New ADO</Btn>
            </>)}
          </div>
        </div>
      </header>
      {openId && open ? (
        <>
          <nav aria-label="Breadcrumb" className="mx-auto flex max-w-7xl min-w-0 items-center gap-1.5 px-gutter pt-3 text-sm">
            <button onClick={() => setOpenId(null)} className="flex items-center gap-1 text-muted hover:text-fg"><ArrowLeft size={14} />All spec pipelines</button>
            <span className="text-muted">/</span>
            <span className="truncate font-medium">{open.ado.id || open.ado.title || "New ADO"}</span>
            {isRunning(open.id) && <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent-strong"><Figma size={12} />Figma build running</span>}
          </nav>
          <PipelineView key={openId} cfg={cfg} setCfg={setCfg} pipe={open} setPipe={(patch) => updatePipe(openId, patch)} all={pipelines} caps={caps} ai={ai} notify={notify} guard={guard} startBuild={startBuild} />
        </>
      ) : (
        <Home pipelines={pipelines} loading={loading} storeMode={store?.mode} onOpen={setOpenId} onNew={() => create()}
          onDuplicate={(p) => create({ ...JSON.parse(JSON.stringify(p)), example: false, ado: { ...p.ado, title: `${p.ado?.title || "Untitled"} (copy)` }, figmaRuns: [], figmaBuild: null })}
          onDelete={remove} />
      )}
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
