import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Figma, RefreshCw, Wand2, AlertTriangle, CheckCircle2, XCircle, Circle, Loader2, ExternalLink, Code2, Copy, Download, Square, MonitorPlay, Maximize2, Sparkles, LayoutTemplate } from "lucide-react";
import { checkCode } from "./proto-render.js";
import { Btn, Modal, Field, inputCls, copyText, fmtDate } from "./ui.jsx";
import { validationMD, driftMD, validationCSV, driftCSV, prdMD, reviewNotesMD } from "./engine.js";
import { parseFigmaUrl, runInFigma, figmaErrorText, pagesToGroups, extractPages, screenList } from "./figma.js";
import { SITEMAP_CODE, refPageCode, mergeContext, contextSummary, nodePageCode, pickSotPages, mergeSot, layoutSummary, PAGE_SCAN_CODE, iconName, notesRefs, designerPageCode } from "./figma-context.js";
import { metaPages, readViewOnly, isAccessError } from "./sot-reader.js";
import { draftPageName, draftIdOf, childPages } from "./figma-build.js";
import { activeDS, RULES, allNodes } from "./config.js";
import { jobStore } from "./jobs.js";
import { saveFile } from "./drawer.jsx";
import { mdForPrompt } from "./mdeditor.jsx";

export const AGENTS = {
  "Figma agent": "Build the screens as Figma frames. Use auto layout, library components and variables only (no detached styles). Name every frame with its journey node and screen name, e.g. “J1.2.1.1 – Store list”. Place frames left to right in journey order; place the Review notes board, the Validation Matrix and the Drift Matrix to the right of the last frame.",
  "Chat assistant": "Produce the screen specifications and annotated layouts for each journey node, then the matrices as Markdown tables ready to paste into Figma text frames to the right of the screens.",
  "Coding agent": "Generate React + Tailwind components for each screen using only the design-system tokens and component guardrails below. One file per screen, named by journey node. Add the matrices as Markdown in /docs.",
};

/* The design system for the Figma agent: the rule, and the package files most useful for UI, trimmed.
   It is the base; the SOT read from Figma shows how the product applies it. */
function dsDigest(ds, max = 9000) {
  const rank = (p) => (/token|color|colour|theme|variable/i.test(p) ? 0 : /button|form|input|table|modal|dialog|layout|grid|spacing|typograph|component|pattern|card|nav/i.test(p) ? 1 : /readme|design\.md|guideline|principle/i.test(p) ? 2 : 3);
  const files = [...(ds.files || [])].filter((f) => typeof f.content === "string" && !/\.(png|jpe?g|svg|gif|woff2?|ttf|otf)$/i.test(f.path)).sort((a, b) => rank(a.path) - rank(b.path));
  let left = max; const parts = [];
  for (const f of files) {
    if (left < 400) break;
    const take = Math.min(left, Math.max(800, Math.floor(max / Math.min(files.length, 6))));
    const body = f.content.trim().replace(/\n{3,}/g, "\n\n");
    parts.push(`### ${f.path}\n${body.length > take ? body.slice(0, take) + "\n…(trimmed)" : body}`);
    left -= Math.min(take, body.length);
  }
  return `## 2. Design system (base) · ${ds.name} (${RULES[ds.rule]?.label})
${RULES[ds.rule]?.text}
How to combine with Figma: the design system gives the base (tokens, component rules, spacing, type). The source of truth (SOT) read from Figma shows how the product really applies it: screen structure, which component is used where, modals, empty/error states and handoff. When they differ, follow the SOT for structure and component choice and the design system for tokens, and list the difference in the Comparison section. Never invent colors or spacing outside the system.
Files (${files.length}${files.length > parts.length ? `, ${parts.length} shown` : ""}):
${parts.join("\n\n") || "—"}`;
}

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
  if (inc.ds) out.push(`## 2. Design system rules · ${ds.name} (${RULES[ds.rule]?.label})\n${RULES[ds.rule]?.text}${ds.fallback ? `\n(This slot has no package yet: the files of “${ds.fallback}” below are the reference.)` : ""}\nNever invent color values or spacing outside the design system's scale.\n\n${ds.files.filter((f) => !/\.svg$/i.test(f.path)).map((f) => `### ${f.path}\n${f.content.trim()}`).join("\n\n")}`);
  if (inc.dsDigest) out.push(dsDigest(ds));
  if (inc.prd) out.push(`## 3. Structured PRD (${cfg.template.name})\n${prdMD(cfg.template.sections, res.prd, ado).replace(/^# .*\n/, "")}`);
  if (ado.designerNotes?.trim()) out.push(`## Designer comments\nTake these into account in every screen and decision:\n${mdForPrompt(ado.designerNotes)}`);
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
  const sotT = parseFigmaUrl(cfg.sotUrl);
  const dsNow = activeDS(cfg);

  /* Sync references: the target file (sitemap, placement, a screen shell to clone) and the source of truth
     (how the product really applies the design system). The SOT can be view-only: then it's read with
     Figma's read-only metadata tool. */
  const analyze = async () => {
    if (!target) { setErr("Add the target Figma file / branch URL in Configuration first."); return; }
    if (!mcp) { setErr("This view can't reach a Figma connector. Open the app as a Claude artifact with the Figma connector connected."); return; }
    setErr(""); setAnalyzing(true);
    try {
      const sitemap = extractPages(await runInFigma(mcp, target.fileKey, SITEMAP_CODE, "Read-only: list pages to map the journey sitemap."));
      const node = sitemap.find((p) => p.name.replace(/^[↳\s]+/, "") === pipe.journeyNode.replace(/^[↳\s]+/, ""));
      /* Shell source in the target file: the journey node page and the closest feature page. */
      /* Candidate pages ranked by how many real screens they hold (any naming), same journey first.
         The best screen shell (app chrome, no overlay open) among them wins. */
      const scanT = await runInFigma(mcp, target.fileKey, PAGE_SCAN_CODE, "Read-only: count the screens on each page to pick reference pages.").catch(() => null);
      const refErrs = [];
      /* 1 · Designer reference: pages and links named in the designer comments are read first and lead. */
      const dn = notesRefs(pipe.ado?.designerNotes, sitemap, pipe.figmaBuild?.pageId ? [pipe.figmaBuild.pageId] : []);
      const dPages = [...dn.pages.map((p) => ({ pageId: p.pageId, nodeId: null, name: p.name }))];
      const dRefs = [], designer = [];
      for (const u of dn.urls) {
        if (u.fileKey === target.fileKey) {
          let pg = null;
          if (u.nodeId) pg = await runInFigma(mcp, target.fileKey, nodePageCode(u.nodeId), "Read-only: find the page of the designer's reference link.").catch((e) => { refErrs.push(`Designer link ${u.nodeId}: ${say(e)}`); return null; });
          if (pg?.id) { const i = dPages.findIndex((x) => x.pageId === pg.id); if (i >= 0) dPages.splice(i, 1); dPages.unshift({ pageId: pg.id, nodeId: u.nodeId, name: pg.name }); }
          else if (!u.nodeId) refErrs.push("Designer link to this file has no node-id: link a page, section or frame.");
          continue;
        }
        /* Another file: learn its structure (components can't be cloned from there). */
        try {
          const pg = u.nodeId ? await runInFigma(mcp, u.fileKey, nodePageCode(u.nodeId), "Read-only: find the page of the designer's reference link.") : null;
          const d = await runInFigma(mcp, u.fileKey, designerPageCode(pg?.id || null, u.nodeId), "Read-only: read the screens the designer pointed to.");
          if (d?.error) throw new Error(d.error);
          designer.push({ ...d, otherFile: true, url: u.url });
        } catch (e) {
          if (!isAccessError(say(e))) { refErrs.push(`Designer link (other file): ${say(e)}`); continue; }
          try {
            const pages = await metaPages(mcp, u.fileKey);
            const id = u.nodeId || pages[0]?.id;
            const [r] = await readViewOnly(mcp, u.fileKey, [id], pages, refErrs);
            if (r) designer.push({ page: r.page, focus: null, screens: r.screenNames, anatomies: r.screenAnatomy ? [{ name: r.screenNames?.[0] || "Screen", w: 0, h: 0, tree: r.screenAnatomy }] : [], otherFile: true, viewOnly: true, url: u.url });
          } catch (e2) { refErrs.push(`Designer link (view access): ${say(e2)}`); }
        }
      }
      for (const dp of dPages.slice(0, 3)) {
        const r = await runInFigma(mcp, target.fileKey, refPageCode(dp.pageId), "Read-only: inspect the page the designer asked to follow.").catch((e) => { refErrs.push(`Designer page ${dp.name || dp.pageId}: ${say(e)}`); return null; });
        if (r) dRefs.push({ ...r, designer: true });
        const d = await runInFigma(mcp, target.fileKey, designerPageCode(dp.pageId, dp.nodeId), "Read-only: read the screens the designer already started.").catch((e) => { refErrs.push(`Designer page ${dp.name || dp.pageId} (screens): ${say(e)}`); return null; });
        if (d && !d.error) designer.unshift(d);
      }
      /* 2 · The journey node page and the pages with the most real screens, same journey first. */
      const skip = new Set(dPages.map((x) => x.pageId));
      const shellIds = [...new Set([...(node && !skip.has(node.id) ? [node.id] : []), ...pickSotPages(sitemap.filter((p) => p.name !== pageName && !skip.has(p.id)), null, pipe.journeyNode, Array.isArray(scanT) ? scanT : null, 5)])].slice(0, dRefs.length ? 4 : 6);
      /* One page at a time: parallel reads of the same file hit Figma's rate limits. */
      const refs = [...dRefs];
      for (const id of shellIds) refs.push(await runInFigma(mcp, target.fileKey, refPageCode(id), "Read-only: inspect how screens, components, styles and handoff are built on this page.").catch((e) => { refErrs.push(`${sitemap.find((p) => p.id === id)?.name || id}: ${say(e)}`); return null; }));
      let merged = mergeContext(sitemap, refs, target.fileKey);
      merged.designer = { sig: dn.sig, refs: designer, asked: dn.urls.length + dn.pages.length };
      if (dn.any && !designer.length) refErrs.unshift("The designer comments point to a Figma page, but it couldn't be read.");
      const sot = parseFigmaUrl(cfg.sotUrl);
      let sotNote = "";
      if (sot) {
        const same = sot.fileKey === target.fileKey;
        let viewOnly = false, sotMap = same ? sitemap : null, sotRefs = [];
        try {
          if (!same) sotMap = extractPages(await runInFigma(mcp, sot.fileKey, SITEMAP_CODE, "Read-only: list the source-of-truth pages."));
          let urlPage = null;
          if (sot.nodeId) { try { urlPage = (await runInFigma(mcp, sot.fileKey, nodePageCode(sot.nodeId), "Read-only: find the page of the source-of-truth link."))?.id || null; } catch {} }
          const scanS = same ? scanT : await runInFigma(mcp, sot.fileKey, PAGE_SCAN_CODE, "Read-only: count the screens on each source-of-truth page.").catch(() => null);
          const ids = pickSotPages(sotMap, urlPage, pipe.journeyNode, Array.isArray(scanS) ? scanS : null).filter((id) => !(same && shellIds.includes(id)));
          if (!ids.length) refErrs.push("SSOT: no page with screens was found in this file.");
          for (const id of ids) sotRefs.push(await runInFigma(mcp, sot.fileKey, refPageCode(id), "Read-only: learn how the source of truth applies the design system (screens, components, modals, handoff).").catch((e) => { refErrs.push(`SSOT ${sotMap.find((p) => p.id === id)?.name || id}: ${say(e)}`); return null; }));
        } catch (e) {
          if (!isAccessError(say(e))) { refErrs.push(`SSOT: ${say(e)}`); }
          else {
          /* View-only file: read layer metadata instead. */
          viewOnly = true;
          try {
            sotMap = await metaPages(mcp, sot.fileKey);
            const urlPage = sot.nodeId && sotMap.some((p) => p.id === sot.nodeId) ? sot.nodeId : null;
            const ids = pickSotPages(sotMap, urlPage, pipe.journeyNode);
            sotRefs = await readViewOnly(mcp, sot.fileKey, ids.length ? ids : sot.nodeId ? [sot.nodeId] : [], sotMap, refErrs);
          } catch (e2) { sotRefs = []; refErrs.push(`SSOT (view access): ${say(e2)}`); sotNote = " · SSOT couldn't be read"; }
          }
        }
        merged = mergeSot(merged, { fileKey: sot.fileKey, sameFile: same, sitemap: sotMap, refs: sotRefs, viewOnly });
        const n = sotRefs.filter(Boolean).length;
        if (!sotNote) sotNote = n ? ` · SSOT: ${n} page${n === 1 ? "" : "s"}${viewOnly ? " (view access)" : ""}` : " · SSOT: nothing could be read";
      }
      merged.readErrors = refErrs.slice(0, 8);
      setPipe({ figmaContext: merged, figmaRefs: [...dPages.map((x) => x.pageId), ...shellIds], journeyNodeMissing: !node });
      const groups = pagesToGroups(sitemap.filter((p) => /^(↳\s*)?[A-Z]\d|^-{2,}/.test(p.name)).map((p) => p.name));
      if (groups.length) onSitemap?.(groups, sitemap.length);
      notify(`References synced · ${sitemap.length} pages, ${Object.keys(merged.exemplars).length} components${sotNote}${refErrs.length ? ` · ${refErrs.length} page${refErrs.length > 1 ? "s" : ""} couldn't be read` : ""}`);
      if (refErrs.length && !merged.screenExemplar) setErr(`No screen shell: the reference pages couldn't be read. ${refErrs.slice(0, 2).join(" · ")}`);
    } catch (e) { setErr(say(e)); }
    finally { setAnalyzing(false); }
  };

  /* Designer comments that point to Figma pages: they must have been read by the last sync. */
  const notesNow = useMemo(() => notesRefs(pipe.ado?.designerNotes, ctx?.sitemap || [], pipe.figmaBuild?.pageId ? [pipe.figmaBuild.pageId] : []), [pipe.ado?.designerNotes, ctx?.sitemap, pipe.figmaBuild?.pageId]);
  const designerStale = !!ctx && notesNow.any && notesNow.sig !== ctx.designer?.sig;
  const blockers = [designerStale && "The designer comments point to a Figma page that hasn't been read yet: Sync the references so the design follows it.", !target && "Add the target Figma file / branch URL in Configuration.", !mcp && "Figma building needs the Figma connector, available when the app runs as a Claude artifact. Elsewhere, copy the master prompt below into an agent that has Figma access.", target && mcp && !ctx && "Sync the references first (step 1 below)."].filter(Boolean);
  const steps = job?.steps;
  const lastCode = job?.lastCode;
  return (
    <section aria-label="Build in Figma" className="rounded-lg border border-accent/40 bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><Figma size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Build in Figma</h3>
            <p className="max-w-[80ch] text-sm text-muted-strong">Uses two references: the uploaded design system (base rules and tokens) and the source of truth (how the product really applies them; view access is enough). Then creates a new [Draft] page under the selected node and builds the design the same way. The build runs in the background: you can keep working on other screens or ADOs.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {running && <Btn icon={Square} onClick={() => jobStore.stop(job.id)} disabled={job.stopping}>{job.stopping ? "Stopping after this step…" : "Stop"}</Btn>}
          <Btn variant="primary" icon={running ? Loader2 : Wand2} disabled={running || analyzing || blockers.length > 0} onClick={() => setConfirm(true)}>{running ? "Building in background…" : build?.docs ? "Build again as a new page" : "Generate design in Figma"}</Btn>
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3 rounded-md border border-line p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">1 · References</p>
            <Btn size="sm" icon={analyzing ? Loader2 : RefreshCw} disabled={analyzing || !target || !mcp} onClick={() => guard("Syncing the references", analyze)}>{analyzing ? "Syncing…" : ctx ? "Sync" : "Sync references"}</Btn>
          </div>
          <p className="text-xs text-muted-strong">The design is a mix: the <span className="font-semibold">design system</span> gives the base rules and tokens, the <span className="font-semibold">source of truth</span> shows how the product really applies them (screens, components, modals, handoff).</p>
          {(notesNow.any || ctx?.designer?.refs?.length > 0) && (
            <div className={`rounded-md p-2.5 text-xs ${designerStale ? "bg-warn-bg text-warn-fg" : "bg-accent-soft"}`}>
              <p className="font-semibold">Designer reference · leads the design</p>
              {designerStale
                ? <p className="mt-0.5">Your designer comments point to {[...notesNow.pages.map((p) => p.name), ...notesNow.urls.map((u) => (u.fileKey === target?.fileKey ? `a link in this file (${u.nodeId || "no node"})` : "a link to another file"))].join(" · ")}. Sync to read it before generating.</p>
                : <ul className="mt-0.5 flex flex-col gap-0.5 text-muted-strong">
                    {(ctx?.designer?.refs || []).map((r, i) => <li key={i}><span className="font-semibold text-fg">{r.page}</span>{r.focus ? ` · ${r.focus}` : ""} · {(r.screens || []).length} screens, {(r.anatomies || []).length} read in detail{r.otherFile ? ` · other file${r.viewOnly ? " (view access)" : ""}: structure only` : ctx?.refPage === r.page ? " · screen shell cloned from it" : ""}</li>)}
                  </ul>}
              <p className="mt-1 text-muted-strong">Pages or Figma links named in the designer comments come first: their screen shell, components, variants and screen structure are followed before the SSOT and the other pages.</p>
            </div>)}
          <div className="rounded-md bg-surface-2 p-2.5 text-xs">
            <p className="font-semibold">Source of truth (SSOT)</p>
            {!sotT ? <p className="mt-0.5 text-warn-fg">Not set. Add the SSOT URL in Configuration; read access is enough.</p>
              : !sum?.sot ? <p className="mt-0.5 text-muted">File <span className="font-mono">{sotT.fileKey}</span>{sotT.fileKey === target?.fileKey ? " (same as target)" : ""} · {ctx ? "nothing read yet, sync again" : "sync to read it"}</p>
              : <ul className="mt-0.5 flex flex-col gap-0.5 text-muted-strong">
                  <li>File <span className="font-mono">{sum.sot.fileKey}</span> · {sum.sot.sameFile ? "same as target · screen shell cloned from it" : sum.sot.viewOnly ? "view access · used as visual reference" : "edit access · components imported by key"}</li>
                  <li>Pages: {sum.sot.pages.join(" · ")}</li>
                  <li>{sum.sot.screens} screens · {sum.sot.components} components in use · {sum.sot.modals} modal pattern{sum.sot.modals === 1 ? "" : "s"}{sum.sot.modalNames.length ? ` (${sum.sot.modalNames.join(", ")})` : ""} · handoff {sum.sot.handoff ? "found" : "not found"}</li>
                </ul>}
          </div>
          <div className="rounded-md bg-surface-2 p-2.5 text-xs">
            <p className="font-semibold">Design system (uploaded)</p>
            <p className="mt-0.5 text-muted-strong">{dsNow.name} · {RULES[dsNow.rule]?.label} · {dsNow.files.filter((f) => !/\.svg$/i.test(f.path)).length} file{dsNow.files.length === 1 ? "" : "s"}{dsNow.fallback ? ` (using “${dsNow.fallback}” files)` : ""}</p>
            <p className="text-muted-strong">Used as written rules for the AI (tokens, components, spacing); colors, text styles and components in Figma come from the file's own variables, styles and library.</p>
          </div>
          {(() => { const lib = ctx?.icons?.length || 0, pkg = dsNow.files.filter((f) => /\.svg$/i.test(f.path)).length; return (
            <div className="rounded-md bg-surface-2 p-2.5 text-xs">
              <p className="font-semibold">Icons</p>
              <p className="mt-0.5 text-muted-strong">{ctx ? (lib ? `${lib} icon components found in the file` : <span className="text-warn-fg">No icon components found in the file{ctx.icons ? "" : " (sync again to look for them)"}</span>) : "Sync to find the file's icons"} · {pkg ? `${pkg} SVG icons in the design-system package` : "no SVGs in the package (upload it again if it has icons)"}</p>
              <p className="text-muted-strong">Each button gets an icon that matches its action: from the file's library first, then from the package's SVGs. Icons that can't be found are left out instead of showing a placeholder.</p>
              {ctx?.icons?.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-muted hover:text-fg">Icon names</summary><p className="mt-1 leading-relaxed">{[...new Set(ctx.icons.map((x) => iconName(x[0])))].join(" · ")}</p></details>}
            </div>); })()}
          <div className="rounded-md bg-surface-2 p-2.5 text-xs">
            <p className="font-semibold">Target file (where the page is created)</p>
            <p className="mt-0.5 text-muted-strong"><span className="font-mono">{target ? target.fileKey : "not set"}</span>{target?.branch ? " (branch)" : ""}{sum ? ` · ${sum.pages} pages · ${sum.components.length} components · ${new Set(sum.styles).size} text styles` : ""}</p>
            {sum && <p className="text-muted-strong">{sum.shell ? <>Screen shell: “{ctx.shellName || "reference screen"}” on {ctx.refPage}{ctx.shellScore >= 800 ? " · header and side navigation found" : <span className="text-warn-fg"> · header or side navigation not detected</span>}</> : <span className="text-warn-fg">No screen shell found: no page of this journey had a screen with header and side navigation, so screens are assembled from library parts (header and navigation components added one by one). Sync again, or add a finished screen of this journey to the target file.</span>}</p>}
            {pipe.journeyNodeMissing && <p className="text-warn-fg">The selected journey node isn't a page in this file. The new page will go at the end.</p>}
          </div>
          {ctx && layoutSummary(ctx) && (() => { const l = layoutSummary(ctx); return (
            <div className="rounded-md bg-surface-2 p-2.5 text-xs">
              <p className="font-semibold">Screen structure learned · {l.screens} screens on {l.page}</p>
              <ul className="mt-0.5 flex flex-col gap-0.5 text-muted-strong">
                <li>Top: {l.top || "—"}</li>
                <li>Navigation: {l.left || "—"}</li>
                <li>Breadcrumb on {l.breadcrumb} screens · page title {l.title || "—"}</li>
                <li>Modals: {l.modal || "—"} · side panels: {l.sidepanel || "—"}{l.scrim ? " · on a scrim" : ""}</li>
                {l.bottom && <li>Bottom bar: {l.bottom}</li>}
              </ul>
            </div>); })()}
          {ctx?.readErrors?.length > 0 && <div role="alert" className="rounded-md bg-bad-bg p-2.5 text-xs text-bad-fg"><p className="font-semibold">{ctx.readErrors.length} reference read{ctx.readErrors.length > 1 ? "s" : ""} failed</p><ul className="mt-0.5 list-disc pl-4">{ctx.readErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
          {ctx && <p className="text-[11px] text-muted">Last synced {fmtDate(ctx.analyzedAt)}. Sync again after the SSOT or the design system changes.</p>}
          {sum && <details className="text-xs"><summary className="cursor-pointer text-muted hover:text-fg">Components found</summary><p className="mt-1 leading-relaxed">{sum.components.join(" · ")}</p></details>}
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">2 · New page</p>
          <Field label="Page name" hint={pipe.draftName ? <button className="underline" onClick={() => guard("Renaming the page being built", () => setPipe({ draftName: "" }))}>Use suggested name</button> : "Suggested from the node and the feature. Edit if needed."}>
            <input id="draftName" className={inputCls} value={pageName} onChange={(e) => { const v = e.target.value; guard("Renaming the page being built", () => setPipe({ draftName: v })); }} />
          </Field>
          <p className="text-xs text-muted-strong">Goes <span className="font-semibold">below “{pipe.journeyNode}”</span>{kids.children.length ? `, ordered by number among its ${kids.children.length} existing page${kids.children.length > 1 ? "s" : ""}` : ""}.</p>
          {kids.children.length > 0 && <ul className="text-[11px] text-muted">{kids.children.map((c) => <li key={c.id} className="truncate">{c.name}</li>)}</ul>}
          <p className="text-xs text-muted">Layout: Feature Card · {draftIdOf(pageName)} · Main design (3 screens per row) · Handoff · Review notes · Comparison</p>
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
            {build && build.docs && !build.review && !running && <Btn size="sm" variant="primary" icon={Wand2} onClick={() => startBuild(pipe.id, { resume: true, autoDraftName: autoName })}>Add Review notes to this page</Btn>}
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

function PrototypePanel({ pipe, ai, mcp, proto, loadProto, startPrototype, notify, downloads }) {
  useSyncExternalStore(jobStore.subscribe, jobStore.snapshot);
  const job = jobStore.forPipeline(pipe.id, "prototype");
  const figmaJob = jobStore.forPipeline(pipe.id, "figma");
  const running = job?.status === "running";
  const building = figmaJob?.status === "running";
  const build = pipe.figmaBuild;
  const ready = !!(build?.plan?.length && build.done > 0);
  const hasCode = Object.keys(build?.code || {}).length > 0;
  const snapN = (build?.snapIds || []).length, planN = (build?.plan || []).length;
  const frame = React.useRef(null);
  const [check, setCheck] = useState(null);
  React.useEffect(() => { loadProto?.(pipe.id); }, [pipe.id]);
  const slug = (pipe.ado.id || "journey").replace(/[^\w-]+/g, "-");
  const full = () => { try { frame.current?.requestFullscreen?.(); } catch {} };
  const doCheck = async () => {
    const fk = parseFigmaUrl(pipe.figmaUrl)?.fileKey;
    if (!mcp || !fk) { notify("Figma isn't connected in this view."); return; }
    setCheck({ busy: true });
    try {
      const r = await runInFigma(mcp, fk, checkCode(build.pageId, build.mainId), "Read-only: list the screens on the generated page to compare with the prototype.");
      if (r?.error) throw new Error(r.error);
      const ids = (r?.names || []).map((n) => (n.match(/^[A-Z]\d+(?:\.\d+)+/) || [""])[0]).filter(Boolean);
      const planIds = (build.plan || []).map((p) => p.id);
      setCheck({ missing: planIds.filter((id) => !ids.includes(id)), extra: ids.filter((id) => !planIds.includes(id)), total: ids.length });
    } catch (e) { setCheck({ error: e?.code ? figmaErrorText(e) : e.message }); }
  };
  return (
    <section aria-label="Navigable HTML prototype" className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><MonitorPlay size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Navigable prototype of the Figma result</h3>
            <p className="max-w-[80ch] text-sm text-muted-strong">An exact copy of the screens drawn in Figma: every box, text, font, color and icon in its place, recorded while the page was generated. One short Claude call wires the buttons, tabs, links and rows into a journey. No Figma calls. Download one HTML file.</p>
          </div>
        </div>
        <Btn variant="primary" icon={running ? Loader2 : MonitorPlay} disabled={running || !ready || building} onClick={() => startPrototype(pipe.id)}>{running ? "Building prototype…" : proto?.html ? "Build again" : "Build prototype"}</Btn>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {!ready && <p className="flex items-center gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg"><AlertTriangle size={14} aria-hidden="true" />Generate the design in Figma first (panel above). The prototype mirrors that page{building ? "; it's being generated now" : ""}.</p>}
        {ready && !building && snapN < planN && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <p className="max-w-[80ch]">{snapN ? `${snapN} of ${planN} screens were recorded from Figma; the rest would be redrawn${hasCode ? " from the saved code" : " from the plan"}, which looks different.` : `This page was generated before screens were recorded, so the prototype would be redrawn${hasCode ? " from the saved code" : " from the screen plan"} and look different from Figma.`} Record them from the Figma page once (read-only, about one Figma call per screen or two, {planN} at most), or generate the page again.</p>
            <Btn size="sm" icon={Figma} disabled={running || !mcp} onClick={() => startPrototype(pipe.id, { capture: true })}>Record from Figma and build</Btn>
          </div>)}
        {build?.snapError && <p className="text-xs text-warn-fg">Last recording note: {build.snapError}</p>}
        {running && (
          <ol className="flex flex-col gap-1.5 text-sm">
            {job.steps.map((st, k) => (
              <li key={k} className="flex items-center gap-2">
                {st.status === "ok" ? <CheckCircle2 size={14} className="text-ok-fg" /> : st.status === "run" ? <Loader2 size={14} className="animate-spin text-accent" /> : <Circle size={14} className="text-muted" />}
                <span>{st.label}</span>{st.note && <span className="text-xs text-muted">· {st.note}</span>}
              </li>
            ))}
          </ol>
        )}
        {job?.status === "error" && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">{job.error}</p>}
        {proto?.html && !running && (<>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{proto.screens} screens{proto.exact !== undefined ? ` (${proto.exact} exact from Figma)` : ""} · {proto.links} interactions wired by {proto.by} · source: {proto.source} · {fmtDate(proto.at)}. Inside: ← → screens · H hotspots · J journey · P present.</p>
            <div className="flex flex-wrap gap-1.5">
              <Btn size="sm" icon={Maximize2} onClick={full}>Full screen</Btn>
              <Btn size="sm" variant="primary" icon={Download} onClick={() => saveFile(downloads, `${slug}-prototype.html`, proto.html, notify)}>Download .html</Btn>
              <Btn size="sm" icon={Figma} disabled={check?.busy} onClick={doCheck}>{check?.busy ? "Checking…" : "Check against Figma"}</Btn>
            </div>
          </div>
          {proto.notes?.length > 0 && <p className="text-xs text-warn-fg">Drawn from the plan instead of the saved code: {proto.notes.join(" · ")}</p>}
          {check && !check.busy && (check.error ? <p className="text-xs text-bad-fg">Couldn't check: {check.error}</p> : <p className={`text-xs ${check.missing.length || check.extra.length ? "text-warn-fg" : "text-ok-fg"}`}>{check.missing.length || check.extra.length ? `Figma page differs: ${check.missing.length ? `missing in Figma ${check.missing.join(", ")}` : ""}${check.extra.length ? ` · only in Figma ${check.extra.join(", ")}` : ""}. Build the prototype again after changing the page.` : `Same ${check.total} screens as the Figma page (one Figma call).`}</p>)}
          <iframe ref={frame} title="Prototype preview" srcDoc={proto.html} sandbox="allow-scripts" className="h-[75vh] w-full rounded-md border border-line bg-[#1d1f23]" />
        </>)}
      </div>
    </section>
  );
}

export function Step4({ cfg, pipe, setPipe, res, notify, downloads, mcp, ai, onSitemap, startBuild, guard, proto, loadProto, startPrototype }) {
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
      <PrototypePanel pipe={pipe} ai={ai} mcp={mcp} proto={proto} loadProto={loadProto} startPrototype={startPrototype} notify={notify} downloads={downloads} />
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

