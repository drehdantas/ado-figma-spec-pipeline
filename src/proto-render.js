/* Prototype without Figma calls: the screen code written during the Figma build is replayed in the browser
   with an HTML version of the same helpers (shell, F, T, I, table, tabs, notice, pageHeader, modal), so the
   prototype mirrors the generated Figma page: app chrome, breadcrumb, components, tables and overlays.
   Builds made before the code was saved are rendered from the screen plan instead. */
import { layoutSummary } from "./figma-context.js";
import { SNAP_CSS } from "./proto-snap.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const px = (n) => (typeof n === "number" ? `${n}px` : n);

/* Colors from the file's variables (read when the Figma file was synced), with neutral fallbacks. */
export function protoTheme(ctx = {}) {
  const v = Object.values(ctx.vars || {});
  const find = (re, def) => v.find((x) => re.test(x.name) && x.hex)?.hex || def;
  const l = layoutSummary(ctx) || {};
  const num = (s, def) => { const m = String(s || "").match(/(\d+)px/); return m ? Number(m[1]) : def; };
  const topH = num(l.top, 64), navW = num(l.left, 72), width = num(l.width, 1366) || 1366;
  return {
    primary: find(/interaction\/(primary|active)|primary$/i, "#005cbc"),
    text: find(/text\/primary/i, "#2d2d2d"),
    text2: find(/text\/secondary/i, "#616161"),
    bg: find(/background\/default/i, "#f5f9ff"),
    surface: find(/background\/layer-01|surface/i, "#ffffff"),
    border: find(/border\/default/i, "#dfe3e8"),
    error: find(/error/i, "#ab2b09"),
    topH, navW, width: Math.max(1100, Math.min(1600, width)),
    browserBar: topH > 110, bottomBar: !!l.bottom, titleSize: num(l.title, 28),
  };
}

/* ---------- HTML versions of the Figma helpers ---------- */
function makeApi({ screens, theme, productName }) {
  const el = (parent, tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; if (parent) (parent.__body || parent).appendChild(d); return d; };
  const size = (d, o) => {
    if (o.fillW) { if (d.parentElement?.classList.contains("h")) d.style.flex = "1 1 0"; else d.style.alignSelf = "stretch"; }
    if (o.w) d.style.width = px(o.w);
    if (o.h) d.style.height = px(o.h);
    if (o.fillH) d.style.alignSelf = "stretch";
  };
  const styleCls = (st = "") => {
    const s = String(st);
    if (/h1|display|\$font-heading-h1/i.test(s)) return "t-h1";
    if (/\(h2\)|h2\b|section title|h5-medium/i.test(s)) return "t-h2";
    if (/\(h3\)|h3\b|subsection/i.test(s)) return "t-h3";
    if (/\(h4\)|h4\b|paragraph title/i.test(s)) return "t-h4";
    if (/caps/i.test(s)) return "t-caps";
    if (/small/i.test(s)) return /bold/i.test(s) ? "t-sm t-b" : "t-sm";
    if (/bold/i.test(s)) return "t-b";
    return "";
  };
  const hot = (d, kind, label) => { d.dataset.hot = kind; d.dataset.label = String(label || "").slice(0, 60); return d; };
  const F = async (parent, o = {}) => {
    const d = el(parent, "div", `f ${o.dir === "H" ? "h" : "v"}`);
    if (o.name) d.dataset.name = o.name;
    if (o.gap != null) d.style.gap = px(o.gap);
    const p = o.pad ?? null;
    if (p != null) d.style.padding = px(p);
    if (o.px != null) { d.style.paddingLeft = px(o.px); d.style.paddingRight = px(o.px); }
    if (o.py != null) { d.style.paddingTop = px(o.py); d.style.paddingBottom = px(o.py); }
    if (o.align) d.style.alignItems = { CENTER: "center", MIN: "flex-start", MAX: "flex-end" }[o.align] || "";
    if (o.justify) d.style.justifyContent = { CENTER: "center", MIN: "flex-start", MAX: "flex-end", SPACE_BETWEEN: "space-between" }[o.justify] || "";
    if (o.bg) d.classList.add("bg-" + String(o.bg).replace(/[^a-z]/gi, ""));
    if (o.radius) d.style.borderRadius = px(o.radius);
    size(d, o);
    return d;
  };
  const T = async (parent, str, o = {}) => {
    const d = el(parent, "div", `t ${styleCls(o.style)} ${o.color === "textSecondary" ? "t-2" : ""}`);
    d.textContent = String(str ?? "");
    size(d, o);
    return d;
  };
  const lab = (o) => (Array.isArray(o.text) ? o.text[0] : o.text) ?? Object.entries(o.props || {}).find(([k]) => /^(text|label|title)/i.test(k))?.[1] ?? "";
  const propOf = (o, re) => Object.entries(o.props || {}).find(([k]) => re.test(k))?.[1];
  const I = async (parent, name, o = {}) => {
    const n = String(name || ""); let d;
    const label = lab(o);
    if (/button ?icon/i.test(n)) d = hot(el(parent, "button", "btn-icon", "⋯"), "button", o.name || label || "icon");
    else if (/button ?hierarch|button group/i.test(n)) { d = el(parent, "div", "f h", ""); d.style.gap = "8px"; const ts = Array.isArray(o.text) ? o.text : [label || "Cancel", "Confirm"]; ts.forEach((t, i) => hot(el(d, "button", i === ts.length - 1 ? "btn btn-p" : "btn btn-s", esc(t)), "button", t)); }
    else if (/^button|button$/i.test(n) || /^button\b/i.test(n)) { const h = String(propOf(o, /hier/i) || ""); d = hot(el(parent, "button", /primary/i.test(h) ? "btn btn-p" : /tertiary|ghost/i.test(h) ? "btn btn-t" : "btn btn-s", esc(label || "Button")), "button", label); }
    else if (/link/i.test(n)) d = hot(el(parent, "a", "lnk", esc(label || "Link")), "link", label);
    else if (/notification|alert|banner/i.test(n)) { const sev = String(propOf(o, /sever|type|status/i) || "Info"); d = el(parent, "div", `note note-${sev.toLowerCase()}`, `<b>${esc(Array.isArray(o.text) ? o.text[0] : label)}</b>${Array.isArray(o.text) && o.text[1] ? `<span>${esc(o.text[1])}</span>` : ""}`); }
    else if (/toggle|switch/i.test(n)) { const on = /true|on|checked/i.test(String(propOf(o, /check|state|value/i))); d = hot(el(parent, "label", "tgl", `<span class="sw${on ? " on" : ""}"></span>${esc(label || "")}`), "toggle", label || "toggle"); }
    else if (/checkbox|radio/i.test(n)) d = hot(el(parent, "label", "chk", `<span class="box${/radio/i.test(n) ? " rd" : ""}"></span>${esc(label || "")}`), "checkbox", label);
    else if (/dropdown|select|combo|filter|date ?picker|search/i.test(n)) d = hot(el(parent, "div", "inp dd", `<span>${esc(label || (/search/i.test(n) ? "Search" : "Select"))}</span><i>▾</i>`), "dropdown", label || n);
    else if (/input|text ?field|form/i.test(n)) d = hot(el(parent, "div", "inp", `<span>${esc(label || "")}</span>`), "input", label || n);
    else if (/tag|chip|badge|status/i.test(n)) d = el(parent, "span", "tag", esc(label || n));
    else if (/bread ?crumb/i.test(n)) d = el(parent, "div", "crumbs", (Array.isArray(o.text) ? o.text : [label]).map((t) => `<a class="lnk">${esc(t)}</a>`).join("<span>›</span>"));
    else if (/tabs/i.test(n)) d = await tabs(parent, Array.isArray(o.text) ? o.text : [label || "Tab 1", "Tab 2"]);
    else if (/^tab\b/i.test(n)) d = hot(el(parent, "button", "tab", esc(label || "Tab")), "tab", label);
    else if (/pagination/i.test(n)) d = el(parent, "div", "pager", `<span>Rows per page 10</span><span>1–10 of 128</span><button class="btn-icon" data-hot="button" data-label="Previous page">‹</button><button class="btn-icon" data-hot="button" data-label="Next page">›</button>`);
    else if (/avatar/i.test(n)) d = el(parent, "span", "avatar", esc((label || "AB").slice(0, 2)));
    else if (/progress|stepper/i.test(n)) d = el(parent, "div", "steps", (Array.isArray(o.text) ? o.text : ["Step 1", "Step 2", "Step 3"]).map((t, i) => `<span class="${i === 0 ? "on" : ""}">${esc(t)}</span>`).join(""));
    else if (/data ?table|table/i.test(n)) d = await table(parent, ["Name", "Status", "Updated"], [["—", "—", "—"]], o);
    else if (/card/i.test(n)) d = el(parent, "div", "card", esc(label || ""));
    else d = el(parent, "div", "cmp", `<small>${esc(n)}</small>${label ? `<span>${esc(label)}</span>` : ""}`);
    if (o.name && d?.dataset) d.dataset.name = o.name;
    if (d) size(d, o);
    return d;
  };
  const clone = (parent, name, o = {}) => I(parent, name, o);
  const table = async (parent, headers, rows, o = {}) => {
    const w = el(parent, "div", "tbl-wrap");
    const t = el(w, "table", "tbl");
    t.innerHTML = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 12).map((r) => `<tr data-hot="row" data-label="${esc(r[0])}">${r.map((c) => `<td>${/^(active|inactive|success|successful|failed|error|pending|partially|draft|done|enabled|disabled)/i.test(String(c)) ? `<span class="tag">${esc(c)}</span>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    if (o.pagination) el(w, "div", "pager", `<span>Rows per page 10</span><span>1–10 of ${o.pages || rows.length}</span><button class="btn-icon" data-hot="button" data-label="Previous page">‹</button><button class="btn-icon" data-hot="button" data-label="Next page">›</button>`);
    if (o.fillW !== false) w.style.alignSelf = "stretch";
    return w;
  };
  const tabs = async (parent, labels = [], o = {}) => {
    const d = el(parent, "div", "tabs");
    labels.forEach((l, i) => hot(el(d, "button", `tab${i === (o.active || 0) ? " on" : ""}`, esc(l)), "tab", l));
    d.style.alignSelf = "stretch";
    return d;
  };
  const notice = async (parent, severity = "Info", title = "", message = "", actions = []) => {
    const d = el(parent, "div", `note note-${String(severity).toLowerCase()}`, `<div><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ""}</div>`);
    if (actions.length) { const a = el(d, "div", "f h"); a.style.gap = "8px"; actions.forEach((x) => hot(el(a, "button", "btn btn-s", esc(x.label || x)), "button", x.label || x)); }
    d.style.alignSelf = "stretch";
    return d;
  };
  const pageHeader = async (content, title, actions = []) => {
    const d = el(content, "div", "ph f h");
    el(d, "div", "t t-h1", esc(title));
    const a = el(d, "div", "f h"); a.style.gap = "8px";
    for (const x of actions) { const h = String(x.props?.Hierachy || x.props?.Hierarchy || ""); hot(el(a, "button", /primary/i.test(h) ? "btn btn-p" : "btn btn-s", esc(x.label || x)), "button", x.label || x); }
    return d;
  };
  const shell = async (spec = {}) => {
    const scr = document.createElement("section");
    scr.className = "screen"; scr.dataset.id = spec.id || `S${screens.length + 1}`; scr.dataset.name = spec.name || ""; scr.dataset.state = spec.state || "";
    const top = el(scr, "div", "chrome-top");
    if (theme.browserBar) el(top, "div", "browser", `<i></i><i></i><i></i><span>${esc(productName)}</span>`);
    el(top, "div", "appbar", `<b class="logo">${esc(productName)}</b><span class="appname">${esc(productName)}</span><span class="tools"><i>⌕</i><i>🔔</i><i>◍</i><span class="avatar">AB</span></span>`);
    const body = el(scr, "div", "chrome-body");
    el(body, "nav", "sidenav", Array.from({ length: 8 }, (_, i) => `<i class="${i === 7 ? "on" : ""}"></i>`).join(""));
    const content = el(body, "main", "content f v");
    if (spec.crumbs?.length) el(content, "div", "crumbs", spec.crumbs.map((c, i) => `<a class="lnk" data-hot="link" data-label="${esc(c)}">${esc(c)}</a>`).join("<span>›</span>"));
    if (theme.bottomBar) el(scr, "div", "chrome-bottom", "");
    screens.push(scr);
    return { frame: scr, content, desk: scr };
  };
  const modal = async (screen, o = {}) => {
    const scr = screen.desk || screen.frame;
    const side = /side|panel|drawer/i.test(o.kind || "");
    el(scr, "div", "scrim");
    const dlg = el(scr, "div", side ? "dlg side" : "dlg");
    if (o.width) dlg.style.width = px(o.width);
    el(dlg, "div", "dlg-head", `<b>${esc(o.title || "")}</b><button class="btn-icon" data-hot="close" data-label="Close">✕</button>`);
    const body = el(dlg, "div", "dlg-body f v");
    if (o.text) el(body, "div", "t", esc(o.text));
    if (o.actions?.length) { const f = el(dlg, "div", "dlg-foot"); o.actions.forEach((a) => hot(el(f, "button", a.primary ? "btn btn-p" : "btn btn-s", esc(a.label || a)), "button", a.label || a)); }
    return { dialog: dlg, body };
  };
  const noop = async () => {};
  const figmaStub = new Proxy({}, { get: () => { throw new Error("raw Figma API not available in the prototype"); } });
  return { F, T, I, clone, table, tabs, notice, pageHeader, shell, modal, cellTable: table, crumbsTo: noop, setTexts: noop, paint: noop, applyProps: noop, loadTextFonts: noop, sty: async () => null, vr: async () => null, exNode: async () => null, resolveName: (n) => n, styleFor: (n) => n, chromeEdges: () => ({ top: 0, left: 0 }), hex: () => ({ r: 0, g: 0, b: 0 }), figma: figmaStub, CTX: { ex: {}, styles: {}, vars: {} }, page: {}, CREATED: [], WARN: [] };
}

/* Replays saved code; screens a batch couldn't draw fall back to the plan. */
export async function renderScreens({ build, theme, productName }) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:1600px;visibility:hidden";
  document.body.appendChild(host);
  const screens = [];
  const api = makeApi({ screens, theme, productName });
  const AF = Object.getPrototypeOf(async function () {}).constructor;
  const notes = [];
  const plan = build.plan || [];
  const code = build.code || {};
  const B = 3;
  for (let b = 0; b < Math.ceil(plan.length / B); b++) {
    const part = plan.slice(b * B, (b + 1) * B);
    const before = screens.length;
    let ok = false;
    if (code[b]) {
      try { await new AF(...Object.keys(api), code[b]).apply(null, Object.values(api)); ok = true; }
      catch (e) { notes.push(`${part[0]?.id}–${part[part.length - 1]?.id}: ${e.message}`); screens.splice(before); }
    }
    if (!ok) {
      for (const s of part) {
        const { content } = await api.shell({ ...s });
        await api.pageHeader(content, s.name.split(" · ")[0], [{ label: "Back" }, { label: "Continue", props: { Hierachy: "Primary" } }]);
        await api.notice(content, /error|fail/i.test(s.state) ? "Error" : /empty|no /i.test(s.state) ? "Warning" : "Info", s.name, s.desc || "");
        await api.T(content, `${s.acs || ""} · ${s.state || ""}`, { style: "Paragraph/Small/Regular", color: "textSecondary" });
      }
    }
  }
  /* Mount each screen, list its hotspots. */
  const out = screens.map((scr) => {
    host.appendChild(scr);
    const hs = [...scr.querySelectorAll("[data-hot]")].slice(0, 60).map((h, i) => { h.dataset.h = i; return { kind: h.dataset.hot, label: h.dataset.label || h.textContent.trim().slice(0, 50), primary: h.classList.contains("btn-p") }; });
    return { id: scr.dataset.id, name: scr.dataset.name, state: scr.dataset.state, html: scr.outerHTML, hotspots: hs };
  });
  host.remove();
  const replayed = Object.keys(code).length;
  return { screens: out, notes, source: replayed ? (notes.length ? "code (some screens from the plan)" : "code saved from the Figma build") : "screen plan (rebuild in Figma to capture the real screens)" };
}

/* Short AI call: where each hotspot goes. */
export function wirePrompt(screens, plan) {
  const desc = Object.fromEntries((plan || []).map((p) => [p.id, p]));
  const lines = screens.map((s) => `- ${s.id} · ${s.name}${desc[s.id]?.desc ? `\n  What it shows: ${desc[s.id].desc}` : ""}\n  Hotspots:\n${s.hotspots.map((h, i) => `    ${i}: ${h.kind}${h.primary ? " (primary)" : ""} "${h.label}"`).join("\n") || "    (none)"}`).join("\n");
  return `Wire a clickable prototype for a usability test. For each meaningful hotspot say which screen it opens, or a short feedback message when it stays on the screen.

SCREENS (journey order) AND HOTSPOTS:
${lines}

Rules: primary actions move forward; Cancel / Close / Back go back; confirm buttons in dialogs lead to the success or result state; tabs and links open the screen that shows that content; Retry leads to the recovered state. Only use screen ids from the list. Skip hotspots with no sensible target. Toasts under 60 characters.

Return exactly ONE JSON object, nothing else:
{"start":"<screen id>","links":[{"s":"<id>","h":<index>,"to":"<id>"},{"s":"<id>","h":<index>,"back":true},{"s":"<id>","h":<index>,"toast":"Saved"}]}`;
}
export function heuristicLinks(screens) {
  const links = [];
  screens.forEach((s, si) => s.hotspots.forEach((h, hi) => {
    const L = (h.label || "").toLowerCase();
    if (h.kind === "close" || /cancel|back|close|dismiss/.test(L)) links.push({ s: s.id, h: hi, back: true });
    else if (h.primary || /continue|next|save|confirm|enable|apply|retry|submit|create|download/.test(L)) { const n = screens[si + 1]; if (n) links.push({ s: s.id, h: hi, to: n.id }); }
    else if (L.length > 2) { const t = screens.find((o) => o.id !== s.id && o.name.toLowerCase().includes(L)); if (t) links.push({ s: s.id, h: hi, to: t.id }); }
  }));
  return links;
}

const CSS = (t) => `
:root{--p:${t.primary};--tx:${t.text};--tx2:${t.text2};--bg:${t.bg};--sf:${t.surface};--bd:${t.border};--err:${t.error}}
*{box-sizing:border-box}body{margin:0;background:#1d1f23;font:14px/1.45 "Inter",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--tx)}
.stage{display:flex;justify-content:center;padding:16px}
.screen{position:relative;width:${t.width}px;min-height:860px;background:var(--bg);overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.4);transform-origin:top center}
.chrome-top{position:relative;z-index:2}.browser{height:46px;background:#dee1e6;display:flex;align-items:center;gap:8px;padding:0 14px}.browser i{width:12px;height:12px;border-radius:50%;background:#ff5f57}.browser i+i{background:#febc2e}.browser i+i+i{background:#28c840}.browser span{margin-left:12px;background:#fff;border-radius:8px 8px 0 0;padding:6px 14px;font-size:12px}
.appbar{height:${Math.min(t.topH, 64)}px;background:#2d2d2d;color:#fff;display:flex;align-items:center;gap:16px;padding:0 24px}.appbar .logo{font-weight:800;letter-spacing:.3px}.appbar .appname{flex:1;text-align:center;font-weight:600}.appbar .tools{display:flex;gap:16px;align-items:center}.appbar .tools i{font-style:normal;opacity:.9}
.chrome-body{display:flex;min-height:780px}.sidenav{width:${t.navW}px;flex-shrink:0;background:var(--sf);border-right:1px solid var(--bd);display:flex;flex-direction:column;align-items:center;gap:22px;padding-top:24px}.sidenav i{width:22px;height:22px;border-radius:5px;background:#c9ced6}.sidenav i.on{background:var(--p);box-shadow:-${Math.round(t.navW / 2) - 12}px 0 0 -8px var(--p)}
.content{flex:1;min-width:0;padding:24px;gap:16px}.chrome-bottom{position:relative;height:64px;background:var(--sf);border-top:1px solid var(--bd)}
.f{display:flex;min-width:0}.f.v{flex-direction:column}.f.h{flex-direction:row;align-items:center}.bg-surface{background:var(--sf);border-radius:8px}.bg-canvas{background:var(--bg)}
.t{min-width:0}.t-h1{font-size:${t.titleSize}px;font-weight:700;line-height:1.2}.t-h2{font-size:22px;font-weight:700}.t-h3{font-size:18px;font-weight:700}.t-h4{font-size:16px;font-weight:600}.t-b{font-weight:600}.t-sm{font-size:12px}.t-caps{font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;color:var(--tx2)}.t-2{color:var(--tx2)}
.ph{justify-content:space-between;gap:16px}
.btn{font:inherit;font-weight:600;border-radius:999px;padding:6px 16px;cursor:pointer;white-space:nowrap}.btn-p{background:var(--p);color:#fff;border:1px solid var(--p)}.btn-s{background:var(--sf);color:var(--p);border:1px solid var(--p)}.btn-t{background:none;border:0;color:var(--p)}
.btn-icon{font:inherit;width:28px;height:28px;border-radius:6px;border:1px solid var(--bd);background:var(--sf);cursor:pointer;color:var(--tx2)}
.lnk{color:var(--p);cursor:pointer;text-decoration:none}.lnk:hover{text-decoration:underline}
.crumbs{display:flex;gap:8px;align-items:center;font-size:13px}.crumbs span{color:var(--tx2)}
.inp{display:flex;align-items:center;justify-content:space-between;border:1px solid #9aa3ad;border-radius:4px;background:#fff;padding:6px 10px;min-width:180px;min-height:32px;color:var(--tx2);cursor:text}.inp.dd{cursor:pointer}.inp i{font-style:normal}
.tgl{display:inline-flex;align-items:center;gap:8px;cursor:pointer}.sw{width:34px;height:18px;border-radius:9px;background:#b1b1b1;position:relative}.sw::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff}.sw.on{background:var(--p)}.sw.on::after{left:18px}
.chk{display:inline-flex;gap:8px;align-items:center;cursor:pointer}.box{width:16px;height:16px;border:1.5px solid #6b7280;border-radius:3px}.box.rd{border-radius:50%}
.tag{display:inline-block;padding:1px 8px;border-radius:4px;background:#e8eef8;color:var(--tx);font-size:12px;white-space:nowrap}
.tabs{display:flex;border-bottom:1px solid var(--bd)}.tab{font:inherit;flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:8px;cursor:pointer;color:var(--tx2)}.tab.on{color:var(--p);border-color:var(--p);font-weight:600}
.note{display:flex;justify-content:space-between;gap:12px;align-items:center;border-radius:6px;padding:12px 14px;border:1px solid;background:#eef4ff;border-color:#9dbbf1}.note b{display:block}.note span{display:block;color:var(--tx2)}.note-warning{background:#fff8e1;border-color:#f3c766}.note-error{background:#fdeeea;border-color:#e9a08d}.note-success{background:#e9f7ee;border-color:#8fd0a5}
.tbl-wrap{background:var(--sf);border:1px solid var(--bd);border-radius:8px;overflow:hidden}.tbl{width:100%;border-collapse:collapse}.tbl th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--tx2);padding:10px 12px;border-bottom:1px solid var(--bd)}.tbl td{padding:10px 12px;border-bottom:1px solid var(--bd)}.tbl tr[data-hot]{cursor:pointer}.tbl tr[data-hot]:hover td{background:#f3f6fb}
.pager{display:flex;gap:16px;justify-content:flex-end;align-items:center;padding:8px 12px;font-size:12px;color:var(--tx2)}
.cmp{border:1px dashed #b6bcc6;border-radius:6px;padding:8px 10px;background:#fff}.cmp small{display:block;color:var(--tx2);font-size:11px}.card{background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:16px}
.avatar{display:inline-flex;width:28px;height:28px;border-radius:50%;background:#7a8899;color:#fff;font-size:11px;align-items:center;justify-content:center}
.steps{display:flex;gap:8px}.steps span{flex:1;border-top:4px solid #c9ced6;padding-top:6px;font-size:12px;color:var(--tx2)}.steps span.on{border-color:var(--p);color:var(--tx)}
.scrim{position:absolute;left:0;right:0;top:${t.topH}px;bottom:0;background:rgba(0,0,0,.4);z-index:5}
.dlg{position:absolute;z-index:6;left:50%;top:${t.topH + 96}px;transform:translateX(-50%);width:480px;background:var(--sf);border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:24px;display:flex;flex-direction:column;gap:16px}.dlg.side{left:auto;right:0;top:${t.topH}px;bottom:0;transform:none;width:400px;border-radius:0}
.dlg-head{display:flex;justify-content:space-between;align-items:center;font-size:18px}.dlg-body{gap:12px}.dlg-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:auto}
[data-hot]{outline-offset:2px}body.hint [data-hot].live,.flash [data-hot].live{outline:2px solid #3d8bfd;background-color:rgba(61,139,253,.12)}
`;

/* The downloadable file: every screen, the wiring, a journey list, present mode and keyboard. */
export function prototypeFile({ title, productName, figmaPage, screens, links, start, theme, source, sprite = "", fonts = [] }) {
  const fontLinks = fonts.filter((f) => f && !/^(system-ui|sans-serif|serif|monospace)$/i.test(f)).slice(0, 6).map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap">`).join("");
  const data = screens.map((s) => ({ id: s.id, name: s.name, html: s.html, links: links.filter((l) => l.s === s.id).map((l) => ({ h: l.h, to: l.to || null, back: !!l.back, toast: l.toast || null })) }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Prototype</title>
${fontLinks ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${fontLinks}` : ""}
<style>${CSS(theme)}
${SNAP_CSS}
.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;padding:8px 16px;background:#111316;color:#f1f3f5;border-bottom:1px solid #2a2d33}.bar .t{flex:1;min-width:0}.bar b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar small{color:#a7adb5}.bar button{font:inherit;color:#f1f3f5;background:#2a2d33;border:1px solid #3a3e45;border-radius:6px;padding:6px 10px;cursor:pointer}
body.present .bar{display:none}aside{position:fixed;top:0;right:0;bottom:0;width:320px;max-width:90vw;background:#111316;color:#f1f3f5;transform:translateX(100%);transition:transform .2s;z-index:30;overflow:auto;padding:16px}aside.open{transform:none}aside a{display:block;padding:8px;border-radius:6px;color:#f1f3f5;text-decoration:none}aside a:hover,aside a.on{background:#2a2d33}aside a small{display:block;color:#a7adb5}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fff;color:#111;padding:10px 16px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);z-index:40;display:none}
.help{color:#a7adb5;font-size:12px;text-align:center;padding:0 16px 24px}
</style></head><body>
${sprite ? `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${sprite}</defs></svg>` : ""}
<div class="bar"><div class="t"><b id="nm"></b><small id="ct"></small></div><button id="prev" aria-label="Previous screen">←</button><button id="next" aria-label="Next screen">→</button><button id="hint" aria-pressed="false">Hotspots (H)</button><button id="jr">Journey (J)</button><button id="pr">Present (P)</button><button id="rs">Restart</button></div>
<div class="stage"><div id="host"></div></div>
<p class="help">${esc(title)} · from the Figma page “${esc(figmaPage || "")}” (${esc(source)}). Click buttons, tabs, links and rows to move through the journey. ← → screens · H hotspots · J journey · P present · Esc leave present.</p>
<aside id="jl" aria-label="Journey"><b>Journey · ${data.length} screens</b><nav id="nav"></nav></aside><div class="toast" id="to" role="status"></div>
<script>
const S=${JSON.stringify(data).replace(/</g, "\\u003c")};const START=${JSON.stringify(start)};
const $=(i)=>document.getElementById(i);let cur=null,hist=[],tt;
const idx=(id)=>S.findIndex(s=>s.id===id);
function toast(m){const t=$("to");t.textContent=m;t.style.display="block";clearTimeout(tt);tt=setTimeout(()=>t.style.display="none",2200)}
function fit(){const sc=document.querySelector(".screen");if(!sc)return;const w=sc.offsetWidth,av=document.body.clientWidth-32;sc.style.transform=w>av?"scale("+(av/w)+")":"";sc.parentElement.style.height=w>av?(sc.offsetHeight*av/w)+"px":""}
function show(id,push){const i=idx(id);if(i<0)return;if(push&&cur&&cur!==id)hist.push(cur);cur=id;const s=S[i];$("host").innerHTML=s.html;$("nm").textContent=s.id+" · "+s.name;$("ct").textContent=(i+1)+" of "+S.length;
const sc=document.querySelector("#host .screen");sc.querySelectorAll("[data-h]").forEach(el=>{const l=s.links.find(x=>String(x.h)===el.dataset.h);if(l)el.classList.add("live");el.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(!l){flash();return}if(l.to)show(l.to,true);else if(l.back)back();else if(l.toast)toast(l.toast)})});
sc.addEventListener("click",flash);document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("on",a.dataset.id===id));try{if(location.hash!=="#"+id)history.replaceState(null,"","#"+id)}catch(e){}window.scrollTo(0,0);fit()}
function back(){const p=hist.pop();if(p)show(p,false);else{const i=idx(cur);if(i>0)show(S[i-1].id,false)}}
function step(d){const i=idx(cur)+d;if(i>=0&&i<S.length)show(S[i].id,true)}
function flash(){const sc=document.querySelector("#host .screen");if(!sc)return;sc.classList.add("flash");setTimeout(()=>sc.classList.remove("flash"),500)}
$("nav").innerHTML=S.map(s=>'<a href="#'+s.id+'" data-id="'+s.id+'">'+s.id+'<small>'+s.name.replace(/[<>&]/g,"")+'</small></a>').join("");
$("nav").onclick=e=>{const a=e.target.closest("a");if(!a)return;e.preventDefault();show(a.dataset.id,true)};
$("prev").onclick=()=>step(-1);$("next").onclick=()=>step(1);$("rs").onclick=()=>{hist=[];show(START,false)};
$("hint").onclick=()=>{const on=document.body.classList.toggle("hint");$("hint").setAttribute("aria-pressed",on)};$("jr").onclick=()=>$("jl").classList.toggle("open");$("pr").onclick=()=>{document.body.classList.toggle("present");fit()};
addEventListener("resize",fit);addEventListener("keydown",e=>{if(e.target.closest("input,textarea"))return;const k=e.key.toLowerCase();if(k==="arrowright")step(1);else if(k==="arrowleft")step(-1);else if(k==="h")$("hint").click();else if(k==="j")$("jr").click();else if(k==="p")$("pr").click();else if(k==="escape"){document.body.classList.remove("present");fit()}});
show(idx(location.hash.slice(1))>=0?location.hash.slice(1):START,false);
</script></body></html>`;
}

/* Optional, one Figma call: are the screens on the Figma page the ones in this prototype? */
export const checkCode = (pageId, mainId) => `
const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
if (!page) return { error: "The generated page is no longer in the file." };
await figma.setCurrentPageAsync(page);
let sec = ${mainId ? `await figma.getNodeByIdAsync(${JSON.stringify(mainId)})` : "null"};
if (!sec || sec.type !== "SECTION") sec = page.children.find((c) => c.type === "SECTION" && /main design/i.test(c.name));
return { names: sec ? sec.children.filter((n) => n.type === "FRAME").map((f) => f.name) : [] };`;
