/* Navigable HTML prototype of the journey: one self-contained file for presentations and user tests.
   Two ways to make it: the AI writes an interactive prototype, or a quick storyboard is built without AI. */
import { activeDS } from "./config.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const trimWords = (t, n) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + "…");

/* Screens to prototype: the Figma plan when there is one, else one screen per designed journey node. */
export function protoScreens(pipe, res, screenList) {
  const plan = pipe.figmaBuild?.plan;
  if (plan?.length) return plan.map((s) => ({ id: s.id, name: s.name, state: s.state || "", acs: s.acs || "", desc: s.desc || "", crumbs: s.crumbs || [] }));
  return screenList(res).map((s, i) => {
    const acs = s.acs.split("; ");
    return { id: s.id, name: trimWords(acs[0]?.replace(/^AC-\d+\s*/, "") || "", 56) || `Screen ${i + 1}`, state: "", acs: acs.map((a) => a.split(" ")[0]).join(" · "), desc: acs.map((a) => a.replace(/^AC-\d+\s*/, "")).join(" "), crumbs: [] };
  });
}

/* Design tokens: colors pulled from the active design system's files, with safe defaults. */
export function protoTokens(cfg) {
  const ds = activeDS(cfg);
  const t = { primary: "#1F5FD1", canvas: "#F6F7F9", surface: "#FFFFFF", text: "#1F2328", muted: "#59636E", border: "#D1D9E0", ok: "#1A7F37", okBg: "#DAFBE1", warn: "#9A6700", warnBg: "#FFF8C5", bad: "#CF222E", badBg: "#FFEBE9", font: "Inter, system-ui, sans-serif" };
  const json = ds.files.find((f) => /\.json$/i.test(f.path));
  try {
    const j = JSON.parse(json.content);
    const m = j.modes?.light || j;
    const pick = (re) => Object.entries(m).find(([k, v]) => re.test(k) && /^#[0-9a-f]{6}$/i.test(String(v)))?.[1];
    t.primary = pick(/brand|primary|interaction\/primary|action/i) || t.primary;
    t.canvas = pick(/background\/(canvas|default)|bg\/canvas/i) || t.canvas;
    t.surface = pick(/background\/(surface|layer)|bg\/surface/i) || t.surface;
    t.text = pick(/text\/primary/i) || t.text;
    t.muted = pick(/text\/secondary/i) || t.muted;
    t.border = pick(/border/i) || t.border;
  } catch {}
  return t;
}

export function prototypePrompt({ brief, screens, tokens, productName, notes }) {
  return `You are a senior UX designer and front-end prototyper. Build a NAVIGABLE, CLICKABLE HTML PROTOTYPE of the journey below, for stakeholder presentations and moderated user tests.

OUTPUT: one complete, self-contained HTML document (<!doctype html> … </html>). Inline all CSS and JavaScript. No external requests at all: no CDN, fonts, images or fetch. Use inline SVG or CSS for icons. Under 90 KB.

STRUCTURE
- Product shell for ${productName}: top bar, left navigation, breadcrumb, content area. Desktop first (1366px), usable down to 1024px.
- One view per screen below, in this order, routed by hash: #/<screen id> (e.g. #/${screens[0]?.id || "J1.1"}). Unknown hash → first screen.
- A presenter panel: a collapsible "Journey" drawer (toggle button bottom-left and keyboard "J") listing every screen with its id, name and state; the current one highlighted. Arrow keys ← → move to the previous / next screen. A "Present" toggle (key "P") hides the drawer and hotspot hints for clean demos. A small "Reset" link restores the initial state.
- Optional hotspot hints: elements that navigate get a subtle outline when hints are on (key "H").

INTERACTIONS (make the flow feel real)
- Primary actions navigate to the screen they lead to. Wire every screen so a tester can walk the whole journey without the drawer.
- Real UI behavior with plain JS: tabs switch, filters narrow the table rows, select-all and bulk bars, toggles/switches change state with labels, confirmation dialogs (focus moves in, Escape closes, focus returns), toasts after actions (with Undo where the brief suggests it), inline validation messages, empty / error / loading states reachable from controls or from their own screens.
- Use realistic sample data from the brief (names, counts, dates). Status always shown with words, not color alone.

DESIGN
- Follow these design tokens: primary ${tokens.primary}, canvas ${tokens.canvas}, surface ${tokens.surface}, text ${tokens.text}, secondary text ${tokens.muted}, border ${tokens.border}, success ${tokens.ok} on ${tokens.okBg}, warning ${tokens.warn} on ${tokens.warnBg}, critical ${tokens.bad} on ${tokens.badBg}. Font: ${tokens.font}. 4-pt spacing, 4–8px radius, one primary button per view.
- Accessible: real <button>/<a>/<label>, visible focus ring, 4.5:1 text contrast, aria-live for toasts.

SCREENS (id · name · state · ACs · what it shows)
${screens.map((s) => `- ${s.id} · ${s.name}${s.state ? " · " + s.state : ""} · ${s.acs || "—"} · ${s.desc || ""}`).join("\n")}
${notes ? `\nDESIGNER COMMENTS (follow them):\n${notes}\n` : ""}
BRIEF:
${brief}

Answer with the HTML document only. No Markdown fences, no explanation.`;
}

export function extractHtml(text) {
  let t = String(text || "").trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  const a = t.search(/<!doctype html|<html[\s>]/i);
  if (a > 0) t = t.slice(a);
  const b = t.toLowerCase().lastIndexOf("</html>");
  if (b > 0) t = t.slice(0, b + 7);
  if (!/<html[\s>]/i.test(t) && !/<body[\s>]/i.test(t)) throw new Error("The answer didn't contain an HTML document.");
  if (!/<!doctype/i.test(t)) t = "<!doctype html>\n" + t;
  return t;
}

/* Quick storyboard: a clickable walkthrough of the screens, built without AI. */
export function storyboardHtml({ title, productName, screens, tokens, res, notes }) {
  const T = tokens;
  const data = screens.map((s, i) => ({ ...s, i }));
  const gaps = (res?.ux?.gaps || []).slice(0, 6);
  const views = data.map((s) => `
  <section class="view" id="v-${esc(s.id)}" data-id="${esc(s.id)}" hidden>
    <div class="crumbs">${(s.crumbs?.length ? s.crumbs : [productName, title]).map(esc).join(" <span>›</span> ")}</div>
    <div class="head"><div><p class="eyebrow">${esc(s.id)}${s.state ? " · " + esc(s.state) : ""}</p><h1>${esc(s.name)}</h1></div>
      <div class="actions">${s.i > 0 ? `<a class="btn secondary" href="#/${esc(data[s.i - 1].id)}">Back</a>` : ""}${s.i < data.length - 1 ? `<a class="btn primary" href="#/${esc(data[s.i + 1].id)}">Continue</a>` : `<button class="btn primary" data-toast="Journey complete">Finish</button>`}</div></div>
    <p class="desc">${esc(s.desc)}</p>
    ${s.acs ? `<p class="acs">Covers ${esc(s.acs)}</p>` : ""}
    <div class="card"><div class="ph"><span>${esc(s.name)}</span><small>Content area · replace with the final design</small></div>
      <table><thead><tr><th>Item</th><th>Detail</th><th>Status</th></tr></thead><tbody>
        ${[1, 2, 3].map((n) => `<tr><td>Sample ${n}</td><td>Illustrative row</td><td><span class="tag ${n === 2 ? "warn" : "ok"}">${n === 2 ? "Pending" : "Active"}</span></td></tr>`).join("")}
      </tbody></table></div>
  </section>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · prototype</title>
<style>
:root{--p:${T.primary};--bg:${T.canvas};--s:${T.surface};--t:${T.text};--m:${T.muted};--b:${T.border};--ok:${T.ok};--okb:${T.okBg};--w:${T.warn};--wb:${T.warnBg}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 ${T.font};color:var(--t);background:var(--bg)}
.top{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:var(--t);color:#fff;font-weight:600}
.layout{display:flex;min-height:calc(100vh - 56px)}nav.side{width:72px;background:var(--s);border-right:1px solid var(--b)}
main{flex:1;padding:24px;max-width:1246px}.crumbs{color:var(--m);font-size:13px;margin-bottom:12px}.crumbs span{margin:0 6px}
.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}.eyebrow{margin:0;color:var(--m);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
h1{margin:4px 0 0;font-size:22px}.desc{max-width:80ch}.acs{color:var(--m);font-size:12px}
.actions{display:flex;gap:8px}.btn{border-radius:6px;padding:8px 14px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;border:1px solid var(--p)}
.btn.primary{background:var(--p);color:#fff}.btn.secondary{background:var(--s);color:var(--p)}
.card{background:var(--s);border:1px solid var(--b);border-radius:8px;padding:20px;margin-top:16px}
.ph{display:flex;flex-direction:column;gap:2px;padding:28px;border:2px dashed var(--b);border-radius:6px;margin-bottom:16px;text-align:center;font-weight:600}.ph small{color:var(--m);font-weight:400}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;text-transform:uppercase;color:var(--m);padding:8px;border-bottom:1px solid var(--b)}td{padding:10px 8px;border-bottom:1px solid var(--b)}
.tag{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}.tag.ok{background:var(--okb);color:var(--ok)}.tag.warn{background:var(--wb);color:var(--w)}
.drawer{position:fixed;left:12px;bottom:56px;width:300px;max-height:70vh;overflow:auto;background:var(--s);border:1px solid var(--b);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:12px}
.drawer h2{font-size:13px;margin:0 0 8px}.drawer a{display:block;padding:6px 8px;border-radius:4px;color:var(--t);text-decoration:none;font-size:13px}.drawer a.on{background:var(--bg);font-weight:700}
.drawer .gaps{margin-top:10px;border-top:1px solid var(--b);padding-top:8px;font-size:12px;color:var(--m)}
.fab{position:fixed;left:12px;bottom:12px;display:flex;gap:6px}.fab button{font:inherit;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid var(--b);background:var(--s);cursor:pointer}
body.present .drawer,body.present .fab{display:none}.toast{position:fixed;right:16px;bottom:16px;background:var(--t);color:#fff;padding:10px 14px;border-radius:6px}
:focus-visible{outline:2px solid var(--p);outline-offset:2px}
</style></head><body>
<div class="top"><span>${esc(productName)}</span><span style="font-weight:400;opacity:.8">${esc(title)}</span></div>
<div class="layout"><nav class="side" aria-label="Main"></nav><main id="main">${views}</main></div>
<aside class="drawer" id="drawer" aria-label="Journey" hidden><h2>Journey · ${data.length} screens</h2>${data.map((s) => `<a href="#/${esc(s.id)}" data-id="${esc(s.id)}">${esc(s.id)} · ${esc(s.name)}${s.state ? ` <small>(${esc(s.state)})</small>` : ""}</a>`).join("")}
${gaps.length ? `<div class="gaps"><strong>Open questions</strong><ul>${gaps.map((g) => `<li>${esc(g.title)}</li>`).join("")}</ul></div>` : ""}${notes ? `<div class="gaps"><strong>Designer comments</strong><p>${esc(notes)}</p></div>` : ""}</aside>
<div class="fab"><button id="tj" aria-controls="drawer">Journey (J)</button><button id="tp">Present (P)</button></div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script>
const ids=${JSON.stringify(data.map((s) => s.id))};
function show(){const id=decodeURIComponent((location.hash.match(/^#\\/(.+)/)||[])[1]||ids[0]);const cur=ids.includes(id)?id:ids[0];
document.querySelectorAll('.view').forEach(v=>v.hidden=v.dataset.id!==cur);document.querySelectorAll('.drawer a').forEach(a=>a.classList.toggle('on',a.dataset.id===cur));window.scrollTo(0,0);}
function go(d){const id=(location.hash.match(/^#\\/(.+)/)||[])[1];let i=ids.indexOf(decodeURIComponent(id||ids[0]));i=Math.max(0,Math.min(ids.length-1,i+d));location.hash='#/'+ids[i];}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.hidden=false;clearTimeout(window.__t);window.__t=setTimeout(()=>t.hidden=true,2500);}
addEventListener('hashchange',show);document.addEventListener('click',e=>{const b=e.target.closest('[data-toast]');if(b)toast(b.dataset.toast);});
document.getElementById('tj').onclick=()=>{const d=document.getElementById('drawer');d.hidden=!d.hidden};document.getElementById('tp').onclick=()=>document.body.classList.toggle('present');
addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select'))return;if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1);if(e.key==='j'||e.key==='J'){const d=document.getElementById('drawer');d.hidden=!d.hidden}if(e.key==='p'||e.key==='P')document.body.classList.toggle('present');});
show();
</script></body></html>`;
}
