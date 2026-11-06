/* Navigable prototype built from the screens generated in Figma: each screen is exported as an image, its real
   interactive elements (buttons, tabs, links, inputs…) become hotspots, and the AI wires each hotspot to the
   screen it leads to. The result is one HTML file (or a .zip) that runs offline. */
import { runInFigma, figmaErrorText, parseFigmaUrl } from "./figma.js";
import { jobStore } from "./jobs.js";
import { parseJSONLoose } from "./engine.js";

const say = (e) => (e?.code ? figmaErrorText(e) : String(e?.message || e));

/* The screens on the generated page, in reading order. */
const listCode = (pageId, mainId) => `
const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
if (!page) return { error: "The generated page is no longer in the file." };
await figma.setCurrentPageAsync(page);
let sec = ${mainId ? `await figma.getNodeByIdAsync(${JSON.stringify(mainId)})` : "null"};
if (!sec || sec.type !== "SECTION") sec = page.children.find((c) => c.type === "SECTION" && /main design/i.test(c.name)) || page.children.find((c) => c.type === "SECTION");
if (!sec) return { error: "No Main design section on the generated page." };
const frames = sec.children.filter((n) => n.type === "FRAME" && n.visible).sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x));
return { section: sec.id, screens: frames.map((f) => ({ fid: f.id, name: f.name })) };`;

/* use_figma returns at most 48 KB per call, so a screen comes in two kinds of call:
   meta (size, clickable elements, image length) and then the image itself in slices. */
const CHUNK = 44000;
const exportPart = (fid, width) => `
const f = await figma.getNodeByIdAsync(${JSON.stringify(fid)});
if (!f) return { error: "Screen not found" };
const desk = f.children.find((c) => /desktop|mobile|tablet/i.test(c.name) && c.type === "FRAME") || f;
const box = desk.absoluteBoundingBox;
const bytes = await desk.exportAsync({ format: "JPG", constraint: { type: "WIDTH", value: Math.min(${width}, Math.round(box.width)) } });
let img;
try { img = figma.base64Encode(bytes); } catch (e) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; let s = "";
  for (let i = 0; i < bytes.length; i += 3) { const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0); s += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? A[n & 63] : "="); }
  img = s;
}`;
const metaCode = (fid, width) => `${exportPart(fid, width)}
const INT = /button|^tab\\b|link|toggle|switch|dropdown|select|checkbox|radio|input|text ?field|menu|pagination|chip|search|date ?picker|filter|segment|stepper|^_?row\\b/i;
const SKIP = /tooltip|icon$|^_?header|logo|avatar|badge|scroll|^\\d+px\\//i;
const ICON = /^[A-Z][A-Za-z]+\\/[a-z0-9_]+$/;
const all = desk.findAll((n) => n.type === "INSTANCE" && INT.test(n.name) && !SKIP.test(n.name) && !ICON.test(n.name) && n.absoluteRenderBounds);
const set = new Set(all.map((n) => n.id));
const hasHit = (n) => n.findOne && !!n.findOne((k) => k.type === "INSTANCE" && set.has(k.id));
const out = [];
for (const h of all.filter((n) => !hasHit(n)).slice(0, 50)) {
  const b = h.absoluteRenderBounds; if (!b || b.width < 8 || b.height < 8) continue;
  const label = h.findAll((k) => k.type === "TEXT" && k.visible && !(k.parent && /tooltip/i.test(k.parent.name))).map((k) => k.characters).join(" ").replace(/\\s+/g, " ").trim().slice(0, 50);
  if (/^(link|button|label|text|title|option|tab|value)$/i.test(label)) continue;
  let props = {}; try { props = h.componentProperties || {}; } catch (e) {}
  const hier = Object.entries(props).find(([k]) => /hier/i.test(k));
  out.push({ x: Math.round(b.x - box.x), y: Math.round(b.y - box.y), w: Math.round(b.width), h: Math.round(b.height), name: h.name.slice(0, 40), label, primary: hier ? /primary/i.test(String(hier[1].value)) : /primary/i.test(h.name) });
}
return { name: f.name, w: Math.round(box.width), h: Math.round(box.height), len: img.length, parts: Math.ceil(img.length / ${CHUNK}), hotspots: out };`;
const partCode = (fid, width, i) => `${exportPart(fid, width)}
return { i: ${i}, len: img.length, part: img.slice(${i * CHUNK}, ${(i + 1) * CHUNK}) };`;

/* Runs tasks with a few in flight at a time. */
async function pool(tasks, n) {
  const out = new Array(tasks.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (k < tasks.length) { const i = k++; out[i] = await tasks[i](); } }));
  return out;
}

const idOf = (name) => (String(name).match(/^[A-Z]\d+(?:\.\d+)+/) || [""])[0];

export const figmaReady = (pipe) => {
  const b = pipe.figmaBuild;
  if (!b?.pageId || !b.plan?.length) return false;
  return (pipe.figmaRuns || []).some((r) => r.ok && r.pageId === b.pageId) || b.done * 3 >= b.plan.length;
};

/* Small prompt: the AI only decides where each hotspot goes, so the answer stays short. */
function wirePrompt({ screens, plan, brief }) {
  const desc = Object.fromEntries((plan || []).map((p) => [p.id, p]));
  const lines = screens.map((s) => {
    const p = desc[s.id] || {};
    const hs = s.hotspots.map((h, i) => `    ${i}: ${h.kind}${h.primary ? " (primary)" : ""} "${h.label || h.name}"`).join("\n");
    return `- ${s.id} · ${s.name.replace(/^[A-Z]\d+(?:\.\d+)+\s*·\s*/, "")}${p.desc ? `\n  What it shows: ${p.desc}` : ""}\n  Hotspots:\n${hs || "    (none)"}`;
  }).join("\n");
  return `You are wiring a clickable prototype made from Figma screens for a usability test. For each meaningful hotspot, say which screen it opens, or which short feedback message it shows when it stays on the same screen.

SCREENS (in journey order) AND THEIR HOTSPOTS:
${lines}

FEATURE CONTEXT (short):
${String(brief || "").slice(0, 3000)}

Rules:
- Follow the journey a real user would take: primary actions move forward, Cancel / Close / Back go back, confirm buttons in dialogs lead to the success or result state, tabs and links open the screen that shows that content, Retry leads to the recovered state.
- Only link to screen ids from the list. Skip hotspots with no sensible target (they show a generic note).
- Keep toast messages under 60 characters.

Return exactly ONE JSON object, nothing else:
{"start":"<screen id>","links":[{"s":"<screen id>","h":<hotspot index>,"to":"<screen id>"},{"s":"<screen id>","h":<hotspot index>,"back":true},{"s":"<screen id>","h":<hotspot index>,"toast":"Saved"}]}`;
}

/* Used when the AI is unavailable: primary → next screen, cancel/back/close → back, tabs/links whose label names a screen → that screen. */
function heuristicLinks(screens) {
  const links = [];
  screens.forEach((s, si) => s.hotspots.forEach((h, hi) => {
    const L = (h.label || "").toLowerCase();
    if (/cancel|back|close|dismiss/.test(L)) links.push({ s: s.id, h: hi, back: true });
    else if (h.primary || /continue|next|save|confirm|enable|apply|retry|submit|create/.test(L)) { const n = screens[si + 1]; if (n) links.push({ s: s.id, h: hi, to: n.id }); }
    else if (L.length > 2) { const t = screens.find((o) => o.id !== s.id && o.name.toLowerCase().includes(L)); if (t) links.push({ s: s.id, h: hi, to: t.id }); }
  }));
  return links;
}

export async function runFigmaPrototype({ pipelineId, getPipe, ai, mcp, compileBrief, onDone, notify, quality = "standard" }) {
  const pipe = getPipe(pipelineId);
  const fk = parseFigmaUrl(pipe.figmaUrl)?.fileKey;
  const build = pipe.figmaBuild;
  const job = jobStore.start({ id: "proto-" + pipelineId + "-" + Date.now(), kind: "prototype", pipelineId, title: pipe.ado?.id || pipe.ado?.title || "Prototype", steps: [{ label: "Read the generated screens in Figma", status: "run", note: "Reading…" }] });
  const step = (i, patch) => jobStore.step(job.id, i, patch);
  const stop = () => { if (jobStore.get(job.id)?.abort) throw Object.assign(new Error("Stopped."), { code: "cancelled" }); };
  try {
    if (!mcp) throw new Error("Figma isn't connected in this view.");
    if (!fk || !figmaReady(pipe)) throw new Error("Generate the Figma page first: the prototype is built from it.");
    const list = await runInFigma(mcp, fk, listCode(build.pageId, build.mainId), "Read-only: list the generated screens for the prototype");
    if (list?.error) throw new Error(list.error);
    const frames = list?.screens || [];
    if (!frames.length) throw new Error("No screens found on the generated page.");
    jobStore.update(job.id, { steps: [{ label: "Read the generated screens in Figma", status: "ok", note: `${frames.length} screens` }, { label: "Export screens and their clickable elements", status: "run", note: `0/${frames.length}` }, { label: "Wire the interactions", status: "todo" }, { label: "Build the prototype file", status: "todo" }] });
    const screens = [];
    const width = quality === "sharp" ? 1440 : 1024;
    for (let i = 0; i < frames.length; i++) {
      stop();
      const call = (code, what) => runInFigma(mcp, fk, code, `Read-only: ${what} for the prototype`).catch((e) => { throw new Error(say(e)); });
      const m = await call(metaCode(frames[i].fid, width), `read screen ${i + 1} of ${frames.length}`);
      if (!m || m.error) throw new Error(m?.error || `Screen ${frames[i].name} couldn't be read.`);
      let done = 0;
      const parts = await pool(Array.from({ length: m.parts }, (_, k) => async () => {
        stop();
        let r = await call(partCode(frames[i].fid, width, k), `export screen ${i + 1} part ${k + 1}`);
        if (!r || r.error || typeof r.part !== "string") r = await call(partCode(frames[i].fid, width, k), `export screen ${i + 1} part ${k + 1} (retry)`);
        if (!r || typeof r.part !== "string" || r.len !== m.len) throw new Error(`Screen ${frames[i].name}: the image changed while exporting. Try again.`);
        step(1, { note: `screen ${i + 1}/${frames.length} · part ${++done}/${m.parts}` });
        return r.part;
      }), 4);
      const img = parts.join("");
      if (img.length !== m.len) throw new Error(`Screen ${frames[i].name}: the image arrived incomplete. Try again.`);
      screens.push({ id: idOf(m.name) || `S${i + 1}`, name: m.name, w: m.w, h: m.h, img, hotspots: m.hotspots || [] });
    }
    step(1, { status: "ok", note: `${screens.length} screens · ${screens.reduce((a, s) => a + s.hotspots.length, 0)} clickable elements` });
    step(2, { status: "run", note: `Asking ${ai.label}…` });
    let wiring = null, by = ai.label;
    try {
      const j = parseJSONLoose(await ai.ask(wirePrompt({ screens, plan: build.plan, brief: compileBrief() }), { title: "Wire the prototype's interactions", tier: "default" }));
      if (Array.isArray(j?.links)) wiring = j;
    } catch (e) { if (e?.code === "cancelled") throw e; }
    if (!wiring) { wiring = { start: screens[0].id, links: heuristicLinks(screens) }; by = "rules (AI unavailable)"; }
    const ids = new Set(screens.map((s) => s.id));
    const links = wiring.links.filter((l) => ids.has(l.s) && Number.isInteger(l.h) && (l.back || l.toast || ids.has(l.to)));
    step(2, { status: "ok", note: `${links.length} interactions · ${by}` });
    stop();
    step(3, { status: "run" });
    const proto = { title: build.pageName?.replace(/^[↳\s]+/, "").replace(/\s*\[Draft\]\s*$/, "") || pipe.ado?.title || "Prototype", start: ids.has(wiring.start) ? wiring.start : screens[0].id, screens, links, by, at: new Date().toISOString(), figmaPage: build.pageName, fileKey: fk };
    step(3, { status: "ok" });
    jobStore.update(job.id, { status: "done" });
    onDone(proto);
    notify("Prototype ready");
  } catch (e) {
    const cancelled = e?.code === "cancelled";
    jobStore.update(job.id, { status: cancelled ? "stopped" : "error", error: cancelled ? "Stopped." : `Couldn't build the prototype: ${e?.message || e}` });
  }
}

/* ---------- The prototype file ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* src(screen) gives the image URL: a data URI for the single-file version, a relative path in the .zip. */
export function prototypeHtml(proto, src) {
  const data = proto.screens.map((s) => ({ id: s.id, name: s.name.replace(/^[A-Z]\d+(?:\.\d+)+\s*·\s*/, ""), w: s.w, h: s.h, src: src(s), hs: s.hotspots.map((h, i) => {
    const l = proto.links.find((k) => k.s === s.id && k.h === i);
    return { x: h.x / s.w * 100, y: h.y / s.h * 100, w: h.w / s.w * 100, h: h.h / s.h * 100, label: h.label || h.name, to: l?.to || null, back: !!l?.back, toast: l?.toast || null };
  }) }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(proto.title)} · Prototype</title>
<style>
:root{--bg:#1d1f23;--bar:#111316;--fg:#f1f3f5;--mu:#a7adb5;--ac:#3d8bfd;--hl:rgba(61,139,253,.18)}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bar);border-bottom:1px solid #2a2d33}
header .t{flex:1;min-width:0}header .t b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}header .t span{color:var(--mu);font-size:12px}
button{font:inherit;color:var(--fg);background:#2a2d33;border:1px solid #3a3e45;border-radius:6px;padding:6px 10px;cursor:pointer}button:hover{background:#34383f}button:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
main{padding:16px;display:flex;justify-content:center}
.stage{position:relative;width:100%;max-width:var(--w,1366px);box-shadow:0 8px 32px rgba(0,0,0,.4)}
.stage img{display:block;width:100%;height:auto;user-select:none}
.hs{position:absolute;border:0;padding:0;background:transparent;border-radius:4px;cursor:pointer}
.hs.live:hover,.hs.live:focus-visible,body.hint .hs.live,.flash .hs.live{background:var(--hl);outline:2px solid var(--ac)}
.hs.dead{cursor:default}
body.present header{display:none}body.present main{padding:0}
aside{position:fixed;top:0;right:0;bottom:0;width:320px;max-width:90vw;background:var(--bar);border-left:1px solid #2a2d33;transform:translateX(100%);transition:transform .2s;z-index:6;overflow:auto;padding:16px}
aside.open{transform:none}aside h2{font-size:13px;margin:0 0 8px;color:var(--mu);text-transform:uppercase;letter-spacing:.06em}
aside a{display:block;padding:8px;border-radius:6px;color:var(--fg);text-decoration:none}aside a:hover{background:#2a2d33}aside a.on{background:#2a2d33;font-weight:600}aside a small{display:block;color:var(--mu)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fff;color:#111;padding:10px 16px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);z-index:9;display:none}
.help{color:var(--mu);font-size:12px;text-align:center;padding:0 16px 24px}
@media (prefers-reduced-motion:reduce){aside{transition:none}}
</style></head>
<body>
<header><div class="t"><b id="nm"></b><span id="ct"></span></div>
<button id="prev" aria-label="Previous screen">←</button><button id="next" aria-label="Next screen">→</button>
<button id="hint" aria-pressed="false">Hotspots (H)</button><button id="jr" aria-controls="jl">Journey (J)</button><button id="pr">Present (P)</button><button id="rs">Restart</button></header>
<main><div class="stage" id="st"><img id="im" alt=""><div id="hl"></div></div></main>
<p class="help">${esc(proto.title)} · built from the Figma page “${esc(proto.figmaPage || "")}”. Click the highlighted elements to move through the journey. Keys: ← → screens · H hotspots · J journey · P present · Esc exit present.</p>
<aside id="jl" aria-label="Journey"><h2>Journey · ${data.length} screens</h2><nav id="nav"></nav></aside>
<div class="toast" id="to" role="status"></div>
<script>
const S=${JSON.stringify(data)};const START=${JSON.stringify(proto.start)};
const $=(i)=>document.getElementById(i);let cur=null,hist=[],tt;
function idx(id){return S.findIndex(s=>s.id===id)}
function toast(m){const t=$("to");t.textContent=m;t.style.display="block";clearTimeout(tt);tt=setTimeout(()=>t.style.display="none",2200)}
function show(id,push){const i=idx(id);if(i<0)return;if(push&&cur&&cur!==id)hist.push(cur);cur=id;const s=S[i];
$("im").src=s.src;$("im").alt=s.id+" · "+s.name;$("st").style.setProperty("--w",s.w+"px");$("nm").textContent=s.id+" · "+s.name;$("ct").textContent=(i+1)+" of "+S.length;
const hl=$("hl");hl.innerHTML="";s.hs.forEach(h=>{const b=document.createElement("button");const live=!!(h.to||h.back||h.toast);b.className="hs "+(live?"live":"dead");b.style.cssText="left:"+h.x+"%;top:"+h.y+"%;width:"+h.w+"%;height:"+h.h+"%";b.setAttribute("aria-label",h.label||"element");b.tabIndex=live?0:-1;
b.onclick=e=>{e.stopPropagation();if(h.to)show(h.to,true);else if(h.back)back();else if(h.toast)toast(h.toast);else flash()};hl.appendChild(b)});
document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("on",a.dataset.id===id));try{if(location.hash!=="#"+id)history.replaceState(null,"","#"+id)}catch(e){}window.scrollTo(0,0)}
function back(){const p=hist.pop();if(p)show(p,false);else{const i=idx(cur);if(i>0)show(S[i-1].id,false)}}
function step(d){const i=idx(cur)+d;if(i>=0&&i<S.length)show(S[i].id,true)}
function flash(){const st=$("st");st.classList.add("flash");setTimeout(()=>st.classList.remove("flash"),500)}
$("nav").innerHTML=S.map(s=>'<a href="#'+s.id+'" data-id="'+s.id+'">'+s.id+'<small>'+s.name.replace(/[<>&]/g,"")+'</small></a>').join("");
$("nav").onclick=e=>{const a=e.target.closest("a");if(!a)return;e.preventDefault();show(a.dataset.id,true)};
$("st").onclick=flash;$("prev").onclick=()=>step(-1);$("next").onclick=()=>step(1);$("rs").onclick=()=>{hist=[];show(START,false)};
$("hint").onclick=()=>{const on=document.body.classList.toggle("hint");$("hint").setAttribute("aria-pressed",on)};$("jr").onclick=()=>$("jl").classList.toggle("open");$("pr").onclick=()=>document.body.classList.toggle("present");
addEventListener("keydown",e=>{if(e.target.closest("input,textarea"))return;const k=e.key.toLowerCase();if(k==="arrowright")step(1);else if(k==="arrowleft")step(-1);else if(k==="h")$("hint").click();else if(k==="j")$("jr").click();else if(k==="p")$("pr").click();else if(k==="escape")document.body.classList.remove("present")});
show(idx(location.hash.slice(1))>=0?location.hash.slice(1):START,false);
</script></body></html>`;
}

export const singleHtml = (proto) => prototypeHtml(proto, (s) => `data:image/jpeg;base64,${s.img}`);

export async function prototypeZip(proto) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error("The zip library didn't load.");
  const zip = new JSZip();
  const file = (s) => `screens/${s.id.replace(/[^\w.-]+/g, "_")}.jpg`;
  zip.file("index.html", prototypeHtml(proto, file));
  for (const s of proto.screens) zip.file(file(s), s.img, { base64: true });
  zip.file("flow.json", JSON.stringify({ title: proto.title, start: proto.start, figmaPage: proto.figmaPage, screens: proto.screens.map((s) => ({ id: s.id, name: s.name, hotspots: s.hotspots })), links: proto.links }, null, 2));
  zip.file("README.txt", `${proto.title} · clickable prototype\n\nOpen index.html in any browser (works offline).\nBuilt from the Figma page "${proto.figmaPage}".\nKeys: arrows = previous/next screen, H = show hotspots, J = journey list, P = present mode, Esc = leave present mode.\nflow.json lists every screen, clickable element and link, for editing or re-use.\n`);
  return zip.generateAsync({ type: "uint8array" });
}
