/* Runs a Figma build as a background job. It reads and writes the pipeline through the app-level store,
   so it keeps going when the user leaves the screen or opens another ADO. */
import { jobStore } from "./jobs.js";
import { runInFigma, figmaErrorText, stripFences, parseFigmaUrl } from "./figma.js";
import { contextForPrompt, resolveIcons } from "./figma-context.js";
import { captureCode } from "./proto-snap.js";
import { dsSvgs } from "./config.js";
import { draftIdOf, createPageCode, screensCode, finalizeMainCode, docsCalls, cardTexts, docsData, planPrompt, batchPrompt, CODE_LIMIT } from "./figma-build.js";
import { parseJSONLoose } from "./engine.js";

export const BATCH = 3;
const say = (e) => (e?.code ? figmaErrorText(e) : String(e?.message || e));
const stopped = (job) => { if (jobStore.get(job.id)?.abort) throw { stopped: true }; };

/* Keeps what Figma drew (snapshot parts) for the prototype; screens that didn't fit one answer are recorded
   with extra short calls. Never fails the build. */
export async function recordSnaps({ mcp, fileKey, pageId, mainId, first, list, state, save, saveSnap, onNote }) {
  let known = state.snapKnown || { s: [], c: [] };
  let parts = state.snapParts || [];
  const keep = async (r) => {
    if (!r || (!r.screens?.length && !Object.keys(r.chrome || {}).length)) return;
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await saveSnap(id, { screens: r.screens || [], chrome: r.chrome || {}, svg: r.svg || {} });
    parts = [...parts, id];
    known = { s: [...new Set([...known.s, ...Object.keys(r.svg || {})])], c: [...new Set([...known.c, ...Object.keys(r.chrome || {})])] };
    save({ snapParts: parts, snapKnown: known, snapIds: [...new Set([...(state.snapIds || []), ...(r.screens || []).map((x) => x.id)])] });
    state = { ...state, snapParts: parts, snapKnown: known, snapIds: [...new Set([...(state.snapIds || []), ...(r.screens || []).map((x) => x.id)])] };
  };
  let pend = list;
  if (first) { await keep(first); pend = first.pending || []; }
  let total = first ? null : (list ? list.length : null), done = 0;
  for (let g = 0; g < 20 && (pend === null || pend.length); g++) {
    onNote?.(total ? `Recording screens · ${done} of ${total}` : "Recording screens…");
    const r = await runInFigma(mcp, fileKey, captureCode(pageId, mainId, pend, known), "Record the screens for the prototype");
    if (r?.error) throw new Error(r.error);
    if (total === null && r?.total) total = r.total;
    done += (r?.screens || []).length;
    await keep(r);
    pend = r?.pending || [];
    if (!(r?.screens || []).length && pend.length) break;
  }
  return state;
}

export async function runFigmaBuild({ pipelineId, getPipe, updatePipe, cfg, ai, mcp, compileBrief, notify, resume, saveSnap }) {
  const pipe0 = getPipe(pipelineId);
  const target = parseFigmaUrl(pipe0.figmaUrl);
  const ctx = { ...pipe0.figmaContext, dsSvgs: dsSvgs(cfg) };
  const pageName = pipe0.draftName || pipe0.autoDraftName;
  const res = pipe0.res;
  const job = jobStore.start({ id: "job-" + pipelineId + "-" + Date.now(), kind: "figma", pipelineId, title: pipe0.ado?.id || pipe0.ado?.title || "ADO", pageName, provider: ai.label });
  const draftId = draftIdOf(pageName);
  let state = resume && pipe0.figmaBuild?.pageName === pageName ? { ...pipe0.figmaBuild } : { pageName, plan: null, pageId: null, mainId: null, done: 0, docs: false };
  const save = (patch) => { state = { ...state, ...patch }; updatePipe(pipelineId, { figmaBuild: state }); };
  const nb = (plan) => Math.ceil(plan.length / BATCH);
  const mk = (plan) => [
    { label: "Plan the screens from the brief and the file", status: state.plan ? "ok" : "todo", note: state.plan ? `${state.plan.length} screens` : "" },
    { label: `Create page “${pageName}” with Feature Card`, status: state.pageId ? "ok" : "todo" },
    ...Array.from({ length: plan ? nb(plan) : 1 }, (_, b) => ({ label: plan ? `Screens ${draftId}.${b * BATCH + 1}–${Math.min(plan.length, (b + 1) * BATCH)}` : "Screens", status: b < state.done ? "ok" : "todo" })),
    { label: state.docs && !state.review ? "Review notes section" : "Handoff, Review notes and Comparison sections", status: state.docs && state.review ? "ok" : "todo" },
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
        const maxChars = Math.max(6000, Math.min(16000, CODE_LIMIT - screensCode(ctx, state.pageId, state.mainId, "").length - 2500));
        try { body = stripFences(await ai.ask(batchPrompt(brief, ctxText, part, draftId, lastError, maxChars), { title: `Screens ${part[0].id}–${part[part.length - 1].id}`, onText: (t) => set(i, { note: t.length > 60 ? `${t.split("\n").length} lines written` : t }) })); jobStore.update(job.id, { lastCode: body }); }
        catch (e) { throw { step: i, msg: `Couldn't write these screens (${e?.message || e?.code}).` }; }
        const bctx = { ...ctx, iconMap: resolveIcons(body, ctx) };
        if (screensCode(bctx, state.pageId, state.mainId, body).length > CODE_LIMIT) {
          lastError = `The code was ${body.length.toLocaleString()} characters; it must stay under ${maxChars.toLocaleString()}. Write shorter code: use small local helper functions and loops, fewer sample rows, shorter texts.`;
          if (attempt === 1) throw { step: i, msg: "The screen code was too long for Figma twice. Try again: answers vary." };
          continue;
        }
        set(i, { note: "Running in Figma…" });
        try {
          const out = await runInFigma(mcp, target.fileKey, screensCode(bctx, state.pageId, state.mainId, body), `Build screens ${part[0].id}–${part[part.length - 1].id}`);
          const n = (out?.created || []).length;
          set(i, { status: "ok", note: `${n} frame${n === 1 ? "" : "s"}${out?.warnings?.length ? ` · ${out.warnings.length} notes` : ""}` });
          /* Keep the code that drew these screens, and what Figma actually drew (for the prototype). */
          save({ code: { ...(state.code || {}), [b]: body }, warnings: [...new Set([...(state.warnings || []), ...(out?.warnings || [])])].slice(-60) });
          if (out?.snaps?.length && saveSnap) {
            try { state = await recordSnaps({ mcp, fileKey: target.fileKey, pageId: state.pageId, mainId: state.mainId, first: null, list: out.snaps, state, save, saveSnap, onNote: (t) => set(i, { note: t }) }); }
            catch (e) { save({ snapError: String(e?.message || e?.code || e).slice(0, 200) }); }
            set(i, { status: "ok", note: `${n} frame${n === 1 ? "" : "s"}${out?.warnings?.length ? ` · ${out.warnings.length} notes` : ""}` });
          }
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
      const calls = docsCalls(ctx, state.pageId, state.mainId, docsData(pageName, pipe0.ado, res, ctx, state.plan, cfg));
      for (let k = state.docsPart || 0; k < calls.length; k++) {
        stopped(job);
        set(i, { status: "run", note: `Part ${k + 1} of ${calls.length} · running in Figma…` });
        try { await runInFigma(mcp, target.fileKey, calls[k], `Build Handoff, Review notes and Comparison for ${pageName} (part ${k + 1} of ${calls.length})`); }
        catch (e) { throw { step: i, msg: say(e) }; }
        save({ docsPart: k + 1 });
      }
      save({ docs: true, review: true });
      set(i, { status: "ok", note: "Placed" });
    } else if (!state.review) {
      /* Pages built before Review notes existed: add just that section. */
      const calls = docsCalls(ctx, state.pageId, state.mainId, docsData(pageName, pipe0.ado, res, ctx, state.plan, cfg), ["Review notes"]);
      for (let k = 0; k < calls.length; k++) {
        stopped(job);
        set(i, { status: "run", note: `Review notes · part ${k + 1} of ${calls.length}` });
        try { await runInFigma(mcp, target.fileKey, calls[k], `Add Review notes to ${pageName} (part ${k + 1} of ${calls.length})`); }
        catch (e) { throw { step: i, msg: say(e) }; }
      }
      save({ review: true });
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
