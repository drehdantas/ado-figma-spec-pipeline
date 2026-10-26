/* Runs a Figma build as a background job. It reads and writes the pipeline through the app-level store,
   so it keeps going when the user leaves the screen or opens another ADO. */
import { jobStore } from "./jobs.js";
import { runInFigma, figmaErrorText, stripFences, parseFigmaUrl } from "./figma.js";
import { contextForPrompt } from "./figma-context.js";
import { draftIdOf, createPageCode, screensCode, finalizeMainCode, docsCode, cardTexts, docsData, planPrompt, batchPrompt } from "./figma-build.js";
import { parseJSONLoose } from "./engine.js";

export const BATCH = 3;
const say = (e) => (e?.code ? figmaErrorText(e) : String(e?.message || e));
const stopped = (job) => { if (jobStore.get(job.id)?.abort) throw { stopped: true }; };

export async function runFigmaBuild({ pipelineId, getPipe, updatePipe, cfg, ai, mcp, compileBrief, notify, resume }) {
  const pipe0 = getPipe(pipelineId);
  const target = parseFigmaUrl(pipe0.figmaUrl);
  const ctx = pipe0.figmaContext;
  const pageName = pipe0.draftName || pipe0.autoDraftName;
  const res = pipe0.res;
  const job = jobStore.start({ id: "job-" + pipelineId + "-" + Date.now(), pipelineId, title: pipe0.ado?.id || pipe0.ado?.title || "ADO", pageName, provider: ai.label });
  const draftId = draftIdOf(pageName);
  let state = resume && pipe0.figmaBuild?.pageName === pageName ? { ...pipe0.figmaBuild } : { pageName, plan: null, pageId: null, mainId: null, done: 0, docs: false };
  const save = (patch) => { state = { ...state, ...patch }; updatePipe(pipelineId, { figmaBuild: state }); };
  const nb = (plan) => Math.ceil(plan.length / BATCH);
  const mk = (plan) => [
    { label: "Plan the screens from the brief and the file", status: state.plan ? "ok" : "todo", note: state.plan ? `${state.plan.length} screens` : "" },
    { label: `Create page “${pageName}” with Feature Card`, status: state.pageId ? "ok" : "todo" },
    ...Array.from({ length: plan ? nb(plan) : 1 }, (_, b) => ({ label: plan ? `Screens ${draftId}.${b * BATCH + 1}–${Math.min(plan.length, (b + 1) * BATCH)}` : "Screens", status: b < state.done ? "ok" : "todo" })),
    { label: "Handoff and Comparison sections", status: state.docs ? "ok" : "todo" },
  ];
  const set = (i, patch) => jobStore.step(job.id, i, patch);
  jobStore.update(job.id, { steps: mk(state.plan) });
  const brief = compileBrief();
  const ctxText = contextForPrompt(ctx);
  let i = 0;
  try {
    if (!state.plan) {
      set(0, { status: "run", note: "Thinking…" });
      let plan;
      try { plan = parseJSONLoose(await ai.ask(planPrompt(brief, ctxText, draftId), { title: "Plan the screens" })); }
      catch (e) { throw { step: 0, msg: `Couldn't plan the screens (${e?.message || e?.code}).` }; }
      plan = (Array.isArray(plan) ? plan : plan?.screens || []).filter((s) => s && s.name).map((s, k) => ({ ...s, id: `${draftId}.${k + 1}`, index: k, crumbs: Array.isArray(s.crumbs) ? s.crumbs : [] }));
      if (!plan.length) throw { step: 0, msg: "The AI returned no screens. Try again." };
      save({ plan });
      jobStore.update(job.id, { steps: mk(plan) });
      set(0, { status: "ok", note: `${plan.length} screens` });
    }
    stopped(job);
    i = 1;
    if (!state.pageId) {
      set(1, { status: "run", note: "Running in Figma…" });
      const anchor = ctx.sitemap.find((p) => p.name.replace(/^[↳\s]+/, "") === pipe0.journeyNode.replace(/^[↳\s]+/, ""));
      try {
        const out = await runInFigma(mcp, target.fileKey, createPageCode({ pageName, anchorId: anchor?.id || null, ctx, card: cardTexts(pageName, pipe0.ado, res, cfg, pipe0) }), `Create draft page ${pageName}`);
        if (!out?.page) throw new Error("Figma did not return the new page id.");
        save({ pageId: out.page, mainId: out.main });
      } catch (e) { throw { step: 1, msg: say(e) }; }
      set(1, { status: "ok", note: "Page created" });
    }
    for (let b = state.done; b < nb(state.plan); b++) {
      stopped(job);
      i = 2 + b;
      const part = state.plan.slice(b * BATCH, (b + 1) * BATCH);
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        set(i, { status: "run", note: attempt ? "Fixing and retrying…" : "Writing…" });
        let body;
        try { body = stripFences(await ai.ask(batchPrompt(brief, ctxText, part, draftId, lastError), { title: `Screens ${part[0].id}–${part[part.length - 1].id}`, onText: (t) => set(i, { note: t.length > 60 ? `${t.split("\n").length} lines written` : t }) })); jobStore.update(job.id, { lastCode: body }); }
        catch (e) { throw { step: i, msg: `Couldn't write these screens (${e?.message || e?.code}).` }; }
        set(i, { note: "Running in Figma…" });
        try {
          const out = await runInFigma(mcp, target.fileKey, screensCode(ctx, state.pageId, state.mainId, body), `Build screens ${part[0].id}–${part[part.length - 1].id}`);
          const n = (out?.created || []).length;
          set(i, { status: "ok", note: `${n} frame${n === 1 ? "" : "s"}${out?.warnings?.length ? ` · ${out.warnings.length} notes` : ""}` });
          lastError = ""; break;
        } catch (e) {
          lastError = (e?.result?.content?.find?.((c) => c.type === "text")?.text || e?.message || "").slice(0, 600);
          try { await runInFigma(mcp, target.fileKey, `const page = await figma.getNodeByIdAsync(${JSON.stringify(state.pageId)}); await figma.setCurrentPageAsync(page); const s = await figma.getNodeByIdAsync(${JSON.stringify(state.mainId)}); const ids = ${JSON.stringify(part.map((p) => p.id + " "))}; const gone = []; for (const c of [...s.children]) if (ids.some((id) => (c.name + " ").startsWith(id))) { gone.push(c.id); c.remove(); } return { removed: gone };`, "Remove partial frames from a failed batch"); } catch {}
          if (attempt === 1) throw { step: i, msg: say(e) };
        }
      }
      save({ done: b + 1 });
    }
    try { await runInFigma(mcp, target.fileKey, finalizeMainCode(state.pageId, state.mainId, state.plan.length), "Fit the Main design section to its screens"); } catch {}
    stopped(job);
    i = 2 + nb(state.plan);
    if (!state.docs) {
      set(i, { status: "run", note: "Running in Figma…" });
      try { await runInFigma(mcp, target.fileKey, docsCode(ctx, state.pageId, state.mainId, docsData(pageName, pipe0.ado, res, ctx, state.plan, cfg)), `Build Handoff and Comparison for ${pageName}`); }
      catch (e) { throw { step: i, msg: say(e) }; }
      save({ docs: true });
      set(i, { status: "ok", note: "Placed" });
    }
    updatePipe(pipelineId, (p) => ({ figmaBuild: state, figmaRuns: [...(p.figmaRuns || []), { at: new Date().toISOString(), kind: "draft", ok: true, page: pageName, pageId: state.pageId, screens: state.plan.length }] }));
    jobStore.update(job.id, { status: "done", endedAt: Date.now() });
    notify(`Figma page ready · ${pipe0.ado?.id || pageName}`);
  } catch (e) {
    if (e?.stopped) { jobStore.update(job.id, { status: "stopped", endedAt: Date.now() }); set(i, { status: "err", note: "Stopped" }); notify("Figma build stopped. You can resume it later."); return; }
    set(e.step ?? i, { status: "err" });
    jobStore.update(job.id, { status: "error", error: e.msg || say(e), endedAt: Date.now() });
    updatePipe(pipelineId, (p) => ({ figmaRuns: [...(p.figmaRuns || []), { at: new Date().toISOString(), kind: "draft", ok: false, page: pageName, error: e.msg || say(e) }] }));
    notify(`Figma build stopped with an error · ${pipe0.ado?.id || ""}`);
  }
}
