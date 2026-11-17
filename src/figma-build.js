/* Builds a new [Draft] page that follows the reference page: Feature Card · Main design section · Handoff · Comparison. */
import { roleVars } from "./figma-context.js";

const GRID = { x0: 100, y0: 100, colW: 1366, gapX: 200, rowH: 1440, cols: 3 };

const idOf = (name) => String(name || "").replace(/^[↳\s]+/, "").split(/\s+/)[0];
const cmpId = (a, b) => { const x = a.split("."), y = b.split("."); for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = parseInt(String(x[i] ?? "-1").replace(/^[A-Za-z]+/, ""), 10), q = parseInt(String(y[i] ?? "-1").replace(/^[A-Za-z]+/, ""), 10); if (p !== q) return p - q; } return 0; };
/* Pages directly under the selected node: the ↳ pages that follow it and carry a deeper journey id. */
export function childPages(sitemap, nodeName) {
  const clean = (n) => String(n).replace(/^[↳\s]+/, "");
  const i = sitemap.findIndex((p) => clean(p.name) === clean(nodeName));
  if (i < 0) return { anchor: null, children: [] };
  const aid = idOf(sitemap[i].name);
  const out = [];
  for (let j = i + 1; j < sitemap.length; j++) {
    const p = sitemap[j];
    if (!/^↳/.test(p.name)) break;
    const pid = idOf(p.name);
    if (!(pid.startsWith(aid + ".") || (pid === aid && /^↳/.test(sitemap[i].name) === false))) break;
    out.push(p);
  }
  return { anchor: sitemap[i], children: out };
}
export function nextChildId(sitemap, nodeName) {
  const { anchor, children } = childPages(sitemap || [], nodeName);
  const aid = idOf(anchor ? anchor.name : nodeName) || "J0";
  if (!children.length) return aid + ".1";
  const ids = children.map((c) => idOf(c.name)).sort(cmpId);
  const last = ids[ids.length - 1].split(".");
  last[last.length - 1] = String((parseInt(last[last.length - 1], 10) || 0) + 1);
  return last.join(".");
}
export function draftPageName(node, ado, _unused, sitemap) {
  const clean = String(node || "").replace(/^[↳\s]+/, "");
  const segs = clean.split(" - ").slice(1).filter((p) => !/\[draft\]/i.test(p));
  const prefix = (segs.length > 1 ? segs.slice(0, -1) : segs).join(" - ") || "Feature";
  const childId = nextChildId(sitemap, node);
  const feat = (ado.title || "New feature").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return `↳ ${childId} - ${prefix.trim()} - ${feat} [Draft]`;
}
export const draftIdOf = (pageName) => (String(pageName).replace(/^[↳\s]+/, "").split(/\s+/)[0] || "J0");

/* Context the in-Figma helpers need, kept small. */
function ctxBlob(ctx) {
  const ex = {};
  for (const [k, v] of Object.entries(ctx.exemplars || {})) ex[k] = { id: v.id, key: v.key, setKey: v.setKey, uses: v.uses || 0, props: Object.fromEntries(Object.entries(v.props || {}).filter(([pk]) => !/#/.test(pk))) };
  const styles = {};
  for (const [k, v] of Object.entries(ctx.styles || {})) styles[k] = [v.id || null, v.key, v.size || 0, v.n || 0];
  const rv = roleVars(ctx);
  const vars = Object.fromEntries(Object.entries(rv).filter(([, v]) => v).map(([k, v]) => [k, { key: v.key, hex: v.hex }]));
  return { ex, styles, vars, screen: ctx.screenExemplar, featureCard: ctx.featureCard?.id || null, sotModals: (ctx.sot?.modals || []).map((m) => ({ name: m.name, w: m.w })), icons: ctx.iconMap || {} };
}

/* use_figma accepts at most 50,000 characters of code per call. The helper prelude is sent with every
   call, so it is compacted (no indentation or comment lines) and only carries the components a call uses. */
export const CODE_LIMIT = 49000;
export function compactJs(code) {
  const out = [];
  let inComment = false;
  for (const raw of code.split("\n")) {
    const l = raw.trim();
    if (inComment) { if (l.includes("*/")) inComment = false; continue; }
    if (!l || l.startsWith("//")) continue;
    if (l.startsWith("/*")) { if (!l.includes("*/")) inComment = true; continue; }
    out.push(l);
  }
  return out.join("\n");
}
const ROLE_HINT = /header|nav|table|cell|row|notification|alert|banner|toast|snack|callout|tab|modal|dialog|breadcrumb|button|input|field|dropdown|select|combo|tag|chip|badge|status|toggle|switch|checkbox|filter|pagination|card|progress|stepper/i;
/* Components a piece of generated code can reach: the ones it names, plus those a role name can resolve to. */
export function ctxFor(ctx, body, { none = false } = {}) {
  if (none) return { ...ctx, exemplars: {} };
  const ex = {};
  for (const [k, v] of Object.entries(ctx.exemplars || {})) if (String(body || "").includes(k) || ROLE_HINT.test(k)) ex[k] = v;
  return { ...ctx, exemplars: ex };
}
export function helpers(ctx, pageId) {
  return compactJs(`
const CTX = ${JSON.stringify(ctxBlob(ctx))};
const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
await figma.setCurrentPageAsync(page);
for (const s of ["Regular", "Medium", "Semi Bold", "Bold"]) await figma.loadFontAsync({ family: "Inter", style: s });
const CREATED = [];
const SNAPS = [];
const WARN = [];
const hex = (h) => { h = String(h || "#000000").replace("#", ""); return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 }; };
const inAL = (p) => p && p.type !== "PAGE" && p.type !== "SECTION" && "layoutMode" in p && p.layoutMode !== "NONE";
const _sty = {};
/* Text styles: the generated code asks for generic names; files name theirs differently, so pick this file's closest style. */
function styleFor(name) {
  if (CTX.styles[name]) return name;
  const ks = Object.keys(CTX.styles); if (!ks.length) return name;
  const by = (re) => ks.filter((k) => re.test(k));
  const most = (arr) => arr.sort((a, b) => (CTX.styles[b][3] || 0) - (CTX.styles[a][3] || 0))[0];
  const big = (arr) => arr.sort((a, b) => (CTX.styles[b][2] || 0) - (CTX.styles[a][2] || 0))[0];
  if (/h1|h2|section title|heading/i.test(name) && !/h3|h4|paragraph/i.test(name)) return big(by(/head|title|h[1-3]\b|display/i).filter((k) => (CTX.styles[k][2] || 0) <= 28)) || name;
  if (/h3|h4|subsection|paragraph title/i.test(name)) return most(by(/h[3-5]\b|subtitle|subhead|title/i)) || name;
  if (/caps/i.test(name)) return most(by(/caps|overline|eyebrow|label/i)) || name;
  if (/small/i.test(name)) return most(by(/small|caption|body ?s\b|xs/i).filter((k) => !/bold/i.test(k) || /bold/i.test(name))) || name;
  if (/bold/i.test(name)) return most(by(/bold|strong|semibold|medium/i).filter((k) => !/head|title/i.test(k))) || name;
  return most(by(/paragraph|body|regular|default|text/i).filter((k) => !/bold|small|caps|head|title/i.test(k))) || most(ks) || name;
}
async function sty(name) {
  name = styleFor(name);
  if (name in _sty) return _sty[name];
  let s = null; const d = CTX.styles[name] || [];
  if (d[0]) { try { s = await figma.getStyleByIdAsync(d[0]); } catch { s = null; } }
  if (!s && d[1]) { try { s = await figma.importStyleByKeyAsync(d[1]); } catch { s = null; } }
  if (!s) { try { s = (await figma.getLocalTextStylesAsync()).find((x) => x.name === name) || null; } catch { s = null; } }
  if (s) { try { await figma.loadFontAsync(s.fontName); } catch { s = null; } }
  if (!s) WARN.push("style " + name);
  return (_sty[name] = s);
}
const _var = {};
async function vr(role) {
  if (role in _var) return _var[role];
  let v = null; const d = CTX.vars[role];
  if (d) { try { v = await figma.variables.importVariableByKeyAsync(d.key); } catch (e) { v = null; } }
  return (_var[role] = v);
}
const FALLBACK = { textPrimary: "#2d2d2d", textSecondary: "#4b4b4b", canvas: "#f5f9ff", surface: "#ffffff" };
async function paint(node, role, prop = "fills") {
  let p = { type: "SOLID", color: hex(FALLBACK[role] || role) };
  const v = FALLBACK[role] ? await vr(role) : null;
  if (v) p = figma.variables.setBoundVariableForPaint(p, "color", v);
  node[prop] = [p];
}
function size(n, parent, o) {
  const al = n.type === "FRAME" && n.layoutMode && n.layoutMode !== "NONE";
  if (o.w || o.h) n.resize(o.w || n.width, o.h || Math.max(n.height, 1));
  if (o.w) { if (inAL(parent)) n.layoutSizingHorizontal = "FIXED"; }
  else if (o.fillW && inAL(parent)) n.layoutSizingHorizontal = "FILL";
  else if (al) n.layoutSizingHorizontal = "HUG";
  if (o.h) { if (inAL(parent)) n.layoutSizingVertical = "FIXED"; }
  else if (o.fillH && inAL(parent)) n.layoutSizingVertical = "FILL";
  else if (al) n.layoutSizingVertical = "HUG";
}
async function F(parent, o = {}) {
  const f = figma.createAutoLayout(o.dir === "H" ? "HORIZONTAL" : "VERTICAL", { name: o.name || "Frame", itemSpacing: o.gap ?? 8 });
  const px = o.px ?? o.pad ?? 0, py = o.py ?? o.pad ?? 0;
  f.paddingLeft = px; f.paddingRight = px; f.paddingTop = py; f.paddingBottom = py;
  f.fills = [];
  if (o.radius) f.cornerRadius = o.radius;
  if (o.align) f.counterAxisAlignItems = o.align;
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.wrap) f.layoutWrap = "WRAP";
  parent.appendChild(f);
  size(f, parent, o);
  if (o.bg) await paint(f, o.bg);
  if (o.stroke) { f.strokes = [{ type: "SOLID", color: hex(o.stroke) }]; f.strokeWeight = 1; }
  return f;
}
async function T(parent, str, o = {}) {
  const t = figma.createText();
  const s = await sty(o.style || "Paragraph/Default/Regular");
  if (s) await t.setTextStyleIdAsync(s.id);
  else { t.fontName = { family: "Inter", style: o.weight || "Regular" }; t.fontSize = o.size || 14; }
  t.characters = String(str ?? "");
  await paint(t, o.color || "textPrimary");
  parent.appendChild(t);
  if (o.w) { t.textAutoResize = "HEIGHT"; t.resize(o.w, Math.max(t.height, 1)); if (inAL(parent)) t.layoutSizingHorizontal = "FIXED"; }
  else if (o.fillW && inAL(parent)) { t.textAutoResize = "HEIGHT"; t.layoutSizingHorizontal = "FILL"; }
  if (o.name) t.name = o.name;
  return t;
}
async function loadTextFonts(t) {
  if (t.fontName === figma.mixed) { for (const seg of t.getStyledTextSegments(["fontName"])) await figma.loadFontAsync(seg.fontName); }
  else await figma.loadFontAsync(t.fontName);
}
async function setTexts(node, values) {
  const list = node.findAll((n) => n.type === "TEXT" && n.visible);
  for (let i = 0; i < list.length && i < values.length; i++) { if (values[i] === undefined || values[i] === null) continue; await loadTextFonts(list[i]); list[i].characters = String(values[i]); }
  return list.length;
}
/* Every file names its components differently. A role name the generated code asks for ("App Header",
   "Data Table", "Notification"…) resolves to this file's own component for that role. */
const ROLES = [
  ["App Header", /^(app ?header|header|top ?bar|app ?bar|nav ?bar|global header|masthead)\b/i, /notification|item|cell/i],
  ["Sidebar Navigation", /side ?nav|sidebar|side navigation|left nav|navigation rail|nav rail/i, /items?\b/i],
  ["Data Table", /^(data ?table|table)\b/i, null],
  ["Notification", /notification|inline (message|alert)|^alert|banner|callout|toast|snackbar/i, /^header notification/i],
  ["Tabs Navigation", /^tabs\b|tab ?bar|tab ?navigation|tab group/i, null],
  ["Tab", /^tab\b/i, /tabs|navigation/i],
  ["Modal", /modal|dialog/i, null],
  ["Side panel", /side ?panel|drawer|sheet/i, null],
  ["Breadcrumb", /bread ?crumb/i, null],
  ["Button", /^button$|^button\b(?!.*(icon|group|menu|hierarch))/i, null],
  ["Input", /^(input|text ?field|text input)\b/i, null],
  ["Dropdown", /dropdown|select\b|combo ?box/i, /menu list/i],
  ["Tag", /^(tag|chip|badge|status)\b/i, null],
  ["Toggle", /toggle|switch/i, null],
  ["Checkbox", /checkbox/i, null],
  ["Filter", /filter/i, null],
  ["Advanced Pagination", /pagination/i, null],
  ["Card", /^card\b/i, null],
  ["Progress Indicator", /progress|stepper/i, null],
];
function resolveName(name) {
  if (CTX.ex[name]) return name;
  const keys = Object.keys(CTX.ex);
  const low = String(name).toLowerCase();
  const exact = keys.find((k) => k.toLowerCase() === low);
  if (exact) return exact;
  const role = ROLES.find(([r]) => r.toLowerCase() === low);
  if (role) { const hit = keys.filter((k) => role[1].test(k) && !(role[2] && role[2].test(k))).sort((a, b) => (CTX.ex[b].uses || 0) - (CTX.ex[a].uses || 0))[0]; if (hit) return hit; }
  const loose = keys.find((k) => k.toLowerCase().includes(low) || low.includes(k.toLowerCase()));
  return loose || name;
}
const _ex = {};
async function exNode(name) {
  name = resolveName(name);
  if (name in _ex) return _ex[name];
  const e = CTX.ex[name];
  let n = null; if (e) { try { n = await figma.getNodeByIdAsync(e.id); } catch {} }
  return (_ex[name] = n);
}
function applyProps(inst, props) {
  const defs = inst.componentProperties || {};
  for (const [k, v] of Object.entries(props || {})) {
    const key = Object.keys(defs).find((d) => d === k || d.split("#")[0] === k);
    if (!key) continue;
    try { inst.setProperties({ [key]: v }); } catch (e) { WARN.push("prop " + k + "=" + v); }
  }
}
/* The reference instance may be caught hovered, pressed or with sample icons on. New instances start from the
   component's own defaults: state back to Default, icons off, and only size/type-like variants carried over. */
const STATEY = /state|interaction|hover|focus|press|active|status/i;
function keepProps(inst, props) {
  const defs = inst.componentProperties || {}, out = {};
  for (const [k, v] of Object.entries(props || {})) {
    const key = Object.keys(defs).find((d) => d === k || d.split("#")[0] === k);
    if (key && defs[key].type === "VARIANT" && !STATEY.test(k)) out[k] = v;
  }
  return out;
}
function resetState(inst, comp) {
  const set = comp.parent && comp.parent.type === "COMPONENT_SET" ? comp.parent : null;
  let pd = {}; try { pd = (set || comp).componentPropertyDefinitions || {}; } catch {}
  const defs = inst.componentProperties || {}, next = {};
  for (const [k, d] of Object.entries(defs)) {
    const def = pd[k] || {};
    if (d.type === "VARIANT" && STATEY.test(k)) {
      const opts = def.variantOptions || [];
      const v = opts.find((x) => /^(default|enabled|rest|normal|idle)$/i.test(x)) || def.defaultValue;
      if (v && v !== d.value) next[k] = v;
    } else if (d.type === "BOOLEAN") {
      const want = /icon/i.test(k) && !/icon/i.test((set || comp).name) ? false : def.defaultValue;
      if (typeof want === "boolean" && d.value !== want) next[k] = want;
    }
  }
  if (Object.keys(next).length) { try { inst.setProperties(next); } catch {} }
}
/* Icons: the screen code asks by name; the app resolved each name to this file's icon component (by id or
   library key) or to an SVG from the design-system package, which becomes a local component once. */
const _icn = {};
async function iconHolder() {
  let h = page.children.find((n) => n.name === "Icons from the design system package");
  if (!h) { h = figma.createFrame(); h.name = "Icons from the design system package"; page.appendChild(h); h.x = -4000; h.y = 0; h.layoutMode = "HORIZONTAL"; h.itemSpacing = 8; h.fills = []; h.layoutSizingHorizontal = "HUG"; h.layoutSizingVertical = "HUG"; }
  return h;
}
async function iconComp(name) {
  if (name in _icn) return _icn[name];
  const d = (CTX.icons || {})[name]; let c = null;
  if (d && d.id) { try { const n = await figma.getNodeByIdAsync(d.id); if (n && n.type === "COMPONENT") c = n; } catch (e) {} }
  if (!c && d && d.k) { try { c = await figma.importComponentByKeyAsync(d.k); } catch (e) {} }
  if (!c && d && d.svg) {
    try { const h = await iconHolder(); c = h.children.find((n) => n.type === "COMPONENT" && n.name === "Icon / " + name) || null; if (!c) { const v = figma.createNodeFromSvg(d.svg); h.appendChild(v); c = figma.createComponentFromNode(v); c.name = "Icon / " + name; } } catch (e) { c = null; }
  }
  if (!c) WARN.push("icon not found: " + name);
  return (_icn[name] = c);
}
/* icon: "name" (leading) or ["leading", "trailing"] (null to skip one side). */
async function setIcon(inst, icon) {
  if (!icon || !inst || inst.type !== "INSTANCE") return;
  const want = Array.isArray(icon) ? icon : [icon, null];
  const defs = inst.componentProperties || {};
  const swaps = Object.keys(defs).filter((k) => defs[k].type === "INSTANCE_SWAP");
  if (!swaps.length) { WARN.push("no icon slot in " + inst.name); return; }
  const trail = (k) => /trail|right|end|after|suffix/i.test(k);
  const lead = swaps.find((k) => !trail(k)) || swaps[0], tr = swaps.find((k) => trail(k)) || (swaps.length > 1 ? swaps[swaps.length - 1] : swaps[0]);
  const plan = [[lead, want[0]], [tr, want[1]]].filter(([k, n]) => k && n);
  for (const [key, nm] of plan) {
    const comp = await iconComp(nm); if (!comp) continue;
    const slot = inst.findOne((k) => k.type === "INSTANCE" && k.componentPropertyReferences && k.componentPropertyReferences.mainComponent === key);
    const sz = slot ? [slot.width, slot.height] : null;
    const on = {}; let p = slot; while (p && p !== inst) { const v = p.componentPropertyReferences && p.componentPropertyReferences.visible; if (v) on[v] = true; p = p.parent; }
    if (!Object.keys(on).length) { for (const b of Object.keys(defs)) if (defs[b].type === "BOOLEAN" && /icon/i.test(b) && trail(b) === trail(key)) on[b] = true; }
    try { inst.setProperties({ ...on, [key]: comp.id }); } catch (e) { WARN.push("icon " + nm + ": " + e.message); continue; }
    if (sz) { const s2 = inst.findOne((k) => k.type === "INSTANCE" && k.componentPropertyReferences && k.componentPropertyReferences.mainComponent === key); if (s2 && (Math.abs(s2.width - sz[0]) > 0.5 || Math.abs(s2.height - sz[1]) > 0.5)) { try { s2.resize(sz[0], sz[1]); } catch (e) {} } }
  }
}
async function I(parent, name, o = {}) {
  name = resolveName(name);
  const e = CTX.ex[name];
  let comp = null;
  const exn = await exNode(name);
  if (exn && exn.type === "INSTANCE") { try { comp = await exn.getMainComponentAsync(); } catch {} }
  if (!comp && e && e.key) { try { comp = await figma.importComponentByKeyAsync(e.key); } catch {} }
  if (!comp && e && e.setKey) { try { const set = await figma.importComponentSetByKeyAsync(e.setKey); comp = set.defaultVariant; } catch {} }
  if (!comp) { WARN.push("missing component " + name); const f = await F(parent, { name: name + " (missing)", pad: 8, stroke: "#d0d0d0" }); await T(f, name, { style: "Paragraph/Small/Regular" }); return f; }
  const inst = comp.createInstance();
  parent.appendChild(inst);
  resetState(inst, comp);
  applyProps(inst, { ...keepProps(inst, e ? e.props : {}), ...(o.props || {}) });
  if (o.icon) await setIcon(inst, o.icon);
  if (o.text !== undefined) {
    const defs = inst.componentProperties || {};
    const tk = Object.keys(defs).find((d) => defs[d].type === "TEXT");
    if (tk && !Array.isArray(o.text)) { try { inst.setProperties({ [tk]: String(o.text) }); } catch { await setTexts(inst, [o.text]); } }
    else await setTexts(inst, Array.isArray(o.text) ? o.text : [o.text]);
  }
  if (o.name) inst.name = o.name;
  size(inst, parent, o);
  return inst;
}
async function clone(parent, name, o = {}) {
  const n = await exNode(name);
  if (!n) return I(parent, name, o);
  const c = n.clone();
  parent.appendChild(c);
  if (o.name) c.name = o.name;
  size(c, parent, o);
  return c;
}
async function cellTable(parent, headers, rows, o) {
  const H = Object.keys(CTX.ex).find((k) => /^_?header ?item|header ?cell|table ?header/i.test(k));
  const C = Object.keys(CTX.ex).find((k) => /^_?cell|table ?cell/i.test(k));
  const t = await F(parent, { name: o.name || "Data Table", fillW: o.fillW !== false, gap: 0, bg: "surface" });
  const row = async (vals, comp, nm) => {
    const rw = await F(t, { name: nm, dir: "H", fillW: true, gap: 0 });
    for (const v of vals) {
      if (comp) { const c = await I(rw, comp, { text: String(v) }); try { c.layoutSizingHorizontal = "FILL"; } catch {} }
      else { const c = await F(rw, { fillW: true, px: 12, py: 10 }); await T(c, String(v), { style: nm === "Header" ? "Paragraph/Small/Caps" : "Paragraph/Default/Regular", color: nm === "Header" ? "textSecondary" : "textPrimary", fillW: true }); }
    }
  };
  await row(headers, H, "Header");
  for (let i = 0; i < Math.min(rows.length, 10); i++) await row(rows[i], C, "Row " + (i + 1));
  if (!H || !C) WARN.push("table built from text styles (no table component on the reference page)");
  return t;
}
async function table(parent, headers, rows, o = {}) {
  if (!(await exNode("Data Table"))) return cellTable(parent, headers, rows, o);
  const dt = await clone(parent, "Data Table", { fillW: o.fillW !== false, name: o.name || "Data Table" });
  const heads = dt.findAll((n) => n.type === "INSTANCE" && /^_HeaderItem/.test(n.name));
  for (let i = 0; i < heads.length; i++) { if (i < headers.length) await setTexts(heads[i], [headers[i]]); else heads[i].visible = false; }
  const rws = dt.findAll((n) => n.type === "INSTANCE" && /^_Row/.test(n.name));
  for (let r = 0; r < rws.length; r++) {
    if (r >= rows.length) { rws[r].visible = false; continue; }
    const cells = rws[r].children.filter((c) => /^_Cell/.test(c.name));
    for (let j = 0; j < cells.length; j++) { if (j < rows[r].length) await setTexts(cells[j], [rows[r][j]]); else cells[j].visible = false; }
  }
  if (o.pagination === false) dt.findAll((n) => /Pagination/.test(n.name)).forEach((n) => (n.visible = false));
  else if (o.pages) { for (const t of dt.findAll((n) => n.type === "TEXT" && /^of \\d/.test(n.characters))) { await loadTextFonts(t); t.characters = "of " + o.pages; } }
  if (rows.length > rws.length) WARN.push("table rows capped at " + rws.length);
  return dt;
}
const CHROME = /header|top ?bar|app ?bar|nav ?bar|side ?nav|sidebar|navigation|browser|broswer|status ?bar|footer|logo|masthead|sticky/i;
const OVERLAY = /scrim|overlay|modal|dialog|side ?panel|drawer|popover|toast|tooltip|snackbar/i;
function isChrome(n) { return CHROME.test(n.name) && !/^content|^main|^body$/i.test(n.name); }
/* App chrome by position, whatever the layers are called: bars stacked along the top and navigation along
   the left. Returns the inner edges of the content area. */
function chromeEdges(desk) {
  const D = desk.absoluteBoundingBox;
  const cand = desk.findAll((k) => k.visible && (k.type === "FRAME" || k.type === "INSTANCE" || k.type === "GROUP") && !OVERLAY.test(k.name))
    .map((k) => ({ k, b: k.absoluteBoundingBox })).filter((x) => x.b).map((x) => ({ k: x.k, rx: x.b.x - D.x, ry: x.b.y - D.y, w: x.b.width, h: x.b.height }));
  let top = 0;
  for (const c of cand.slice().sort((a, b) => a.ry - b.ry)) if (c.ry <= top + 4 && c.rx <= 4 && c.w >= D.width * 0.6 && c.h <= 160 && c.ry + c.h > top) top = c.ry + c.h;
  let left = 0;
  for (const c of cand) if (c.rx <= 4 && c.w <= 340 && c.h >= (D.height - top) * 0.45 && c.ry <= top + 8 && c.rx + c.w > left) left = c.rx + c.w;
  return { top, left, D };
}
const isChromeGeo = (n, E) => { const b = n.absoluteBoundingBox; if (!b) return false; const rx = b.x - E.D.x, ry = b.y - E.D.y; return (ry + b.height <= E.top + 4 && b.width >= E.D.width * 0.5) || (rx + b.width <= E.left + 4 && rx <= 4 && b.height >= E.D.height * 0.3) || (ry + b.height >= E.D.height - 4 && b.height <= 120 && b.width >= E.D.width * 0.5); };
/* The content area: the largest frame inside the space the chrome leaves, preferring auto-layout. */
function findContent(desk) {
  if (!desk || !("findAll" in desk)) return null;
  const E = chromeEdges(desk);
  const W = E.D.width - E.left, H = E.D.height - E.top;
  const named = desk.findAll((n) => n.type === "FRAME" && /^(content|main|page content|main content)\\b/i.test(n.name) && n.width >= W * 0.5);
  if (named.length) return named[named.length - 1];
  const inArea = desk.findAll((n) => {
    if (n.type !== "FRAME" || !n.visible || OVERLAY.test(n.name)) return false;
    let p = n.parent; while (p && p !== desk) { if (p.type === "INSTANCE") return false; p = p.parent; }
    const b = n.absoluteBoundingBox; const rx = b.x - E.D.x, ry = b.y - E.D.y;
    return rx >= E.left - 4 && ry >= E.top - 4 && b.width >= W * 0.6 && b.height >= H * 0.3 && !isChromeGeo(n, E);
  });
  inArea.sort((a, b) => (b.layoutMode && b.layoutMode !== "NONE" ? 1 : 0) - (a.layoutMode && a.layoutMode !== "NONE" ? 1 : 0) || b.width * b.height - a.width * a.height);
  return inArea[0] || null;
}
async function clearContent(content, crumbs) {
  for (const c of [...content.children]) { if (!(c.type === "INSTANCE" && /bread ?crumb/i.test(c.name))) c.remove(); }
  if (!content.layoutMode || content.layoutMode === "NONE") { content.layoutMode = "VERTICAL"; content.itemSpacing = 16; content.paddingTop = content.paddingBottom = content.paddingLeft = content.paddingRight = 24; content.counterAxisSizingMode = "FIXED"; }
  try { content.primaryAxisSizingMode = "AUTO"; } catch {}
  const bc = content.children.find((c) => /bread ?crumb/i.test(c.name));
  if (bc && crumbs && crumbs.length) await crumbsTo(bc, crumbs);
  else if (crumbs && crumbs.length && CTX.ex[resolveName("Breadcrumb")]) { const b = await I(content, "Breadcrumb"); await crumbsTo(b, crumbs); }
}
/* Keep the app chrome (by position or name) and the path down to the content; remove open overlays
   (scrim, modals, side panels, tooltips) and leftovers around the content. */
function prune(desk, content) {
  const E = chromeEdges(desk);
  let node = content;
  while (node && node.parent && node !== desk) {
    const parent = node.parent;
    for (const sib of [...parent.children]) {
      if (sib === node) continue;
      if (OVERLAY.test(sib.name)) { sib.remove(); continue; }
      if (isChromeGeo(sib, E) || ((sib.type === "INSTANCE" || sib.type === "FRAME") && isChrome(sib))) continue;
      sib.remove();
    }
    node = parent;
  }
}
/* Absolute-positioned screens with no content frame: keep the chrome, add an auto-layout Content frame
   in the space that is left. */
async function carveContent(desk, crumbs) {
  const E = chromeEdges(desk);
  for (const c of [...desk.children]) { if (OVERLAY.test(c.name) || !(isChromeGeo(c, E) || isChrome(c))) c.remove(); }
  const content = await F(desk, { name: "Content", w: Math.round(desk.width - E.left), pad: 24, gap: 16 });
  if (desk.layoutMode && desk.layoutMode !== "NONE") content.layoutPositioning = "ABSOLUTE";
  content.x = E.left; content.y = E.top;
  if (crumbs && crumbs.length && CTX.ex[resolveName("Breadcrumb")]) { const b = await I(content, "Breadcrumb"); await crumbsTo(b, crumbs); }
  GROW.push([desk.id, content.id]);
  return content;
}
const GROW = [];
/* Desktop screens are 1080 px tall by default; a screen grows only when its content (or an open modal)
   needs more. Full-height chrome (side navigation, scrim, side panel) follows, bottom bars stay at the bottom. */
const DESK_H = 1080;
async function growShells() {
  for (const [, deskId] of SNAPS) {
    const desk = await figma.getNodeByIdAsync(deskId);
    if (!desk || desk.width < 1024) continue;
    const D = desk.absoluteBoundingBox; const E = chromeEdges(desk);
    const bottomOf = (n) => { const b = n.absoluteBoundingBox; return b ? b.y - D.y + b.height : 0; };
    const g = GROW.find((x) => x[0] === deskId);
    const content = g ? await figma.getNodeByIdAsync(g[1]) : findContent(desk);
    let need = 0;
    if (content && "children" in content) { for (const k of content.children) if (k.visible) need = Math.max(need, bottomOf(k)); need += (content.paddingBottom || 0) + 24; }
    for (const [dl, dk, kind] of POSITION) if (dk === deskId && kind === "modal") { const n = await figma.getNodeByIdAsync(dl); if (n) need = Math.max(need, bottomOf(n) + 48); }
    const oldH = desk.height;
    const kids = desk.children.filter((c) => c.visible);
    const bottoms = kids.filter((c) => Math.abs(c.y + c.height - oldH) <= 2 && c.height <= 120 && c.width >= desk.width * 0.5 && c.y > oldH * 0.5);
    const tall = kids.filter((c) => !bottoms.includes(c) && Math.abs(c.y + c.height - oldH) <= 2 && c.y <= E.top + 8 && c.height >= oldH * 0.4);
    need += bottoms.reduce((a, c) => Math.max(a, c.height), 0);
    const H = Math.max(DESK_H, Math.ceil(need));
    if (Math.abs(H - oldH) < 1) continue;
    if (desk.layoutMode && desk.layoutMode !== "NONE") { try { desk.layoutSizingVertical = "FIXED"; } catch (e) {} }
    desk.resize(desk.width, H);
    for (const t of tall) { if (Math.abs(t.y + t.height - H) > 2) { try { t.resize(t.width, Math.max(1, H - t.y)); } catch (e) {} } }
    for (const b of bottoms) { if (Math.abs(b.y + b.height - H) > 2) b.y = H - b.height; }
    const fr = desk.parent;
    if (fr && fr.type === "FRAME" && (!fr.layoutMode || fr.layoutMode === "NONE")) fr.resize(fr.width, desk.y + H);
  }
}
/* Modals and side panels go ON TOP of the screen, the way the product shows them: a scrim below the
   top bar and the dialog centered (modal) or docked right at full height (side panel). Returns { dialog, body }:
   put the form fields / text into body; actions are library Buttons in the footer. */
async function modal(screen, o = {}) {
  const desk = screen.desk || screen.frame;
  const E = chromeEdges(desk);
  const kind = /side|panel|drawer/i.test(o.kind || "") ? "sidepanel" : "modal";
  const sotM = (CTX.sotModals || []).find((m) => (kind === "sidepanel" ? /side|panel|drawer/i : /modal|dialog/i).test(m.name));
  const w = o.width || (sotM ? sotM.w : kind === "sidepanel" ? 400 : 480);
  const scrim = figma.createRectangle(); desk.appendChild(scrim);
  if (desk.layoutMode && desk.layoutMode !== "NONE") scrim.layoutPositioning = "ABSOLUTE";
  scrim.name = "Scrim"; scrim.resize(desk.width, Math.max(10, desk.height - E.top)); scrim.x = 0; scrim.y = E.top;
  scrim.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.4 }];
  const dlg = await F(desk, { name: (kind === "sidepanel" ? "Side panel · " : "Modal · ") + (o.title || ""), w, pad: 24, gap: 16, radius: kind === "sidepanel" ? 0 : 8, bg: "surface" });
  if (desk.layoutMode && desk.layoutMode !== "NONE") dlg.layoutPositioning = "ABSOLUTE";
  dlg.effects = [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.18 }, offset: { x: 0, y: 8 }, radius: 24, spread: 0, visible: true, blendMode: "NORMAL" }];
  const head = await F(dlg, { name: "Title", dir: "H", fillW: true, gap: 8, align: "CENTER" });
  await T(head, o.title || "Title", { style: "Heading/(H3) Subsection Title", fillW: true });
  if (CTX.ex[resolveName("Button Icon")]) { try { await I(head, "Button Icon", { name: "Close", icon: "close" }); } catch {} }
  const body = await F(dlg, { name: "Body", fillW: true, gap: 12 });
  if (o.text) await T(body, o.text, { style: "Paragraph/Default/Regular", fillW: true });
  if (o.actions && o.actions.length) {
    const foot = await F(dlg, { name: "Footer", dir: "H", fillW: true, gap: 8, justify: "MAX" });
    for (const a of o.actions) await I(foot, "Button", { text: a.label || a, icon: a.icon, props: a.primary ? { Hierachy: "Primary", Hierarchy: "Primary" } : { Hierachy: "Secondary", Hierarchy: "Secondary" } });
  }
  if (kind === "sidepanel") { dlg.x = desk.width - w; dlg.y = E.top; try { dlg.layoutSizingVertical = "FIXED"; } catch {} dlg.resize(w, Math.max(200, desk.height - E.top)); }
  else { dlg.x = Math.round(E.left + (desk.width - E.left - w) / 2); dlg.y = E.top + 96; }
  POSITION.push([dlg.id, desk.id, kind, E.top, E.left, w]);
  return { dialog: dlg, body };
}
/* Re-center modals once their content is in (height known). */
const POSITION = [];
async function placeOverlays() {
  for (const [d, k, kind, top, left, w] of POSITION) {
    const dlg = await figma.getNodeByIdAsync(d), desk = await figma.getNodeByIdAsync(k);
    if (!dlg || !desk) continue;
    if (kind === "modal") dlg.y = Math.round(top + Math.max(48, Math.min(160, (desk.height - top - dlg.height) / 2)));
  }
}
async function shell(spec) {
  const { id, name, state, acs, desc, crumbs, index } = spec;
  const full = id + " · " + name + (state ? " · " + state : "");
  let frame, content, deskOut = null;
  const ex = CTX.screen ? await figma.getNodeByIdAsync(CTX.screen) : null;
  const captioned = ex && ex.children && ex.children[0] && /^caption/i.test(ex.children[0].name) && ex.children[1];
  if (ex && captioned) {
    frame = ex.clone();
    frame.name = full;
    const cap = frame.children[0];
    if (cap) { cap.name = "Caption · " + id; await setTexts(cap, [full, acs || "", desc || ""]); }
    const desk = frame.children[1];
    if (desk) desk.name = id + " · Desktop / " + name + (state ? " · " + state : "");
    deskOut = desk;
    content = findContent(desk);
    if (content) { prune(desk, content); await clearContent(content, crumbs); }
    else content = await carveContent(desk, crumbs);
  } else if (ex) {
    /* Reference screens without a caption (any naming): keep the file's own shell, chrome included, and
       empty only its content area. */
    frame = await F(page, { name: full, w: Math.round(ex.width), gap: 24 });
    const cap = await F(frame, { name: "Caption · " + id, fillW: true, gap: 8 });
    await T(cap, full, { style: "Heading/(H2) Section Title", fillW: true });
    await T(cap, acs || "", { style: "Paragraph/Default/Regular", color: "textSecondary", fillW: true });
    await T(cap, desc || "", { style: "Paragraph/Default/Regular", color: "textSecondary", fillW: true });
    const desk = ex.clone();
    frame.appendChild(desk);
    desk.name = id + " · Desktop / " + name + (state ? " · " + state : "");
    deskOut = desk;
    content = findContent(desk);
    if (content) { prune(desk, content); await clearContent(content, crumbs); }
    else content = await carveContent(desk, crumbs);
  } else {
    frame = await F(page, { name: full, w: 1366, gap: 24 });
    const cap = await F(frame, { name: "Caption · " + id, fillW: true, gap: 8 });
    await T(cap, full, { style: "Heading/(H2) Section Title", fillW: true });
    await T(cap, acs || "", { style: "Paragraph/Default/Regular", color: "textSecondary", fillW: true });
    await T(cap, desc || "", { style: "Paragraph/Default/Regular", color: "textSecondary", fillW: true });
    const desk = await F(frame, { name: id + " · Desktop / " + name, w: 1366, h: 1080, bg: "canvas", gap: 0 });
    deskOut = desk;
    await I(desk, "App Header", { fillW: true });
    const body = await F(desk, { name: "Body", dir: "H", fillW: true, fillH: true, gap: 0 });
    await I(body, "Sidebar Navigation", { fillH: true });
    content = await F(body, { name: "Content", fillW: true, pad: 24, gap: 16 });
    if (crumbs) { const bc = await I(content, "Breadcrumb"); await crumbsTo(bc, crumbs); }
  }
  const sec = await figma.getNodeByIdAsync(SECTION_ID);
  sec.appendChild(frame);
  frame.x = ${GRID.x0} + (index % ${GRID.cols}) * ${GRID.colW + GRID.gapX};
  frame.y = ${GRID.y0} + Math.floor(index / ${GRID.cols}) * ${GRID.rowH};
  CREATED.push(frame.id);
  SNAPS.push([id, (deskOut || frame).id, name, state || ""]);
  return { frame, content, desk: deskOut };
}
async function crumbsTo(bc, crumbs) {
  const hasText = (k) => k.visible && (k.type === "TEXT" || ("findOne" in k && !!k.findOne((n) => n.type === "TEXT")));
  const idxs = bc.children.map((k, i) => (hasText(k) ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < idxs.length && i < crumbs.length; i++) {
    const k = bc.children[idxs[i]];
    if (k.type === "TEXT") { await loadTextFonts(k); k.characters = String(crumbs[i]); } else await setTexts(k, [crumbs[i]]);
  }
  for (let i = crumbs.length; i < idxs.length; i++) {
    const j = idxs[i];
    const k = bc.children[j]; if (k) k.visible = false;
    const sep = bc.children[j - 1]; if (sep && !idxs.includes(j - 1)) sep.visible = false;
  }
}
async function tabs(parent, labels, o = {}) {
  const tn = await clone(parent, "Tabs Navigation", { fillW: true, ...o });
  const tl = tn.findAll((n) => n.type === "INSTANCE" && /^Tab/.test(n.name) && n !== tn);
  for (let i = 0; i < tl.length; i++) { if (i < labels.length) await setTexts(tl[i], [labels[i]]); else tl[i].visible = false; }
  tn.findAll((n) => /More/i.test(n.name) && n !== tn).forEach((n) => (n.visible = false));
  return tn;
}
async function notice(parent, severity, title, message, actions = []) {
  const n = await I(parent, "Notification", { props: { Severity: severity || "Info" }, fillW: true });
  await setTexts(n, [title, message]);
  const btns = n.findAll((k) => k.type === "INSTANCE" && /^Button/.test(k.name) && !/Hierarchy/.test(k.name) && !/Icon/.test(k.name));
  for (let i = 0; i < btns.length; i++) { if (i < actions.length) await setTexts(btns[i], [actions[i]]); else btns[i].visible = false; }
  if (!actions.length) n.findAll((k) => /Button Hierarchy/.test(k.name)).forEach((k) => (k.visible = false));
  return n;
}
async function pageHeader(content, title, actions = []) {
  const h = await F(content, { name: "Page header", dir: "H", fillW: true, gap: 16, align: "CENTER" });
  const t = await T(h, title, { style: "Heading/(H2) Section Title", fillW: true });
  for (const a of actions) await I(h, "Button", { props: a.props || {}, text: a.label || a, icon: a.icon });
  return h;
}
`);
}

export function createPageCode({ pageName, anchorId, ctx, card }) {
  return `
const CTX = ${JSON.stringify(ctxBlob(ctx))};
const anchor = await figma.getNodeByIdAsync(${JSON.stringify(anchorId)});
const idx = anchor ? figma.root.children.indexOf(anchor) : figma.root.children.length - 1;
const existing = figma.root.children.find((p) => p.name === ${JSON.stringify(pageName)});
if (existing) throw new Error("A page named " + ${JSON.stringify(pageName)} + " already exists. Rename the new page or delete the old one first.");
// Read the reference feature card before switching pages
const fcSrc = CTX.featureCard ? await figma.getNodeByIdAsync(CTX.featureCard) : null;
const page = figma.createPage();
page.name = ${JSON.stringify(pageName)};
const idOf = (n) => String(n).replace(/^[↳\\s]+/, "").split(/\\s+/)[0];
const cmp = (a, b) => { const x = a.split("."), y = b.split("."); for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = parseInt(String(x[i] ?? "-1").replace(/^[A-Za-z]+/, ""), 10), q = parseInt(String(y[i] ?? "-1").replace(/^[A-Za-z]+/, ""), 10); if (p !== q) return p - q; } return 0; };
const NEW_ID = idOf(page.name);
const kids = figma.root.children.filter((p) => p !== page);
let insertAt = idx + 1;
if (anchor) {
  const aid = idOf(anchor.name);
  // walk the selected node's own ↳ pages; stop before the first one with a higher number
  while (insertAt < kids.length) {
    const p = kids[insertAt];
    if (!/^↳/.test(p.name)) break;
    const pid = idOf(p.name);
    if (!(pid.startsWith(aid + ".") || (pid === aid && !/^↳/.test(anchor.name)))) break;
    if (cmp(pid, NEW_ID) > 0) break;
    insertAt++;
  }
}
figma.root.insertChild(Math.min(insertAt, figma.root.children.length - 1), page);
await figma.setCurrentPageAsync(page);
const ids = { page: page.id };
let x = 200;
if (fcSrc) {
  const fc = fcSrc.clone();
  page.appendChild(fc);
  fc.x = 200; fc.y = 200;
  fc.name = ${JSON.stringify(card.name)};
  const T = ${JSON.stringify(card.texts)};
  const texts = fc.findAll((n) => n.type === "TEXT");
  for (const t of texts) {
    const v = T[t.name] !== undefined ? T[t.name] : (t.parent && t.parent.name === "Resource" && t.name !== "Section Name" ? T.__problem : undefined);
    if (v === undefined) continue;
    if (t.fontName === figma.mixed) { for (const s of t.getStyledTextSegments(["fontName"])) await figma.loadFontAsync(s.fontName); } else await figma.loadFontAsync(t.fontName);
    t.characters = String(v);
  }
  ids.featureCard = fc.id;
  x = 200 + fc.width + 200;
}
const mk = (name, w, h) => { const s = figma.createSection(); s.name = name; page.appendChild(s); s.x = x; s.y = 200; s.resizeWithoutConstraints(w, h); x += w + 200; return s; };
const main = mk(${JSON.stringify(card.mainName)}, 4698, 1632);
ids.main = main.id;
return ids;`;
}

export function finalizeMainCode(pageId, sectionId, count) {
  const rows = Math.max(1, Math.ceil(count / GRID.cols));
  const cols = Math.min(GRID.cols, Math.max(1, count));
  return `
const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
await figma.setCurrentPageAsync(page);
const s = await figma.getNodeByIdAsync(${JSON.stringify(sectionId)});
s.resizeWithoutConstraints(${GRID.x0 * 2 + cols * GRID.colW + (cols - 1) * GRID.gapX}, ${GRID.y0 * 2 + (rows - 1) * GRID.rowH + 1232});
return { section: s.id, w: s.width, h: s.height };`;
}

/* Handoff + Comparison sections, styled like the reference cards (deterministic). */
/* Handoff and Comparison, built over as many calls as the 50,000-character limit needs. Each part adds
   cards to its section (created by the first part, found by name after that). */
const clip = (v, n = 320) => { const t = String(v ?? ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
function docsPartCode(ctx, pageId, mainId, part) {
  return `${helpers(ctxFor(ctx, "", { none: true }), pageId)}
const SECTION_ID = null;
const P = ${JSON.stringify(part)};
const main = await figma.getNodeByIdAsync(${JSON.stringify(mainId)});
async function card(parent, title, note, cols, rows) {
  const c = await F(parent, { name: "Card · " + title, w: 1700, pad: 24, gap: 16, radius: 4, bg: "surface" });
  await T(c, title, { style: "Heading/(H3) Subsection Title", w: 1652 });
  if (note) await T(c, note, { style: "Paragraph/Small/Regular", color: "textSecondary", w: 1652 });
  const tb = await F(c, { name: "Table · " + title, w: 1652, gap: 0 });
  const hr = await F(tb, { name: "Header row", dir: "H", w: 1652, gap: 16 }); hr.paddingBottom = 12;
  for (const [h, w] of cols) await T(hr, h, { style: "Heading/(H3) Subsection Title", w });
  let i = 0;
  for (const r of rows) {
    const row = await F(tb, { name: "Row " + (++i), dir: "H", w: 1652, gap: 16, py: 16 });
    row.strokes = [{ type: "SOLID", color: hex("#e6e6e6") }]; row.strokeTopWeight = 1; row.strokeBottomWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
    for (let j = 0; j < cols.length; j++) await T(row, r[j] ?? "", { style: "Paragraph/Default/Regular", w: cols[j][1] });
  }
  return c;
}
let s = page.children.find((c) => c.type === "SECTION" && c.name === P.name);
let f;
if (!s) {
  const right = Math.max(main.x + main.width, ...page.children.filter((c) => c.type === "SECTION").map((c) => c.x + c.width));
  s = figma.createSection(); s.name = P.name; page.appendChild(s); s.x = right + 200; s.y = 200;
  f = await F(s, { name: P.frame, w: 1700, gap: 24 }); f.x = 100; f.y = 100;
  await T(f, P.title, { style: "Heading/(H2) Section Title", w: 1700 });
  await T(f, P.sub, { style: "Paragraph/Default/Regular", color: "textSecondary", w: 1700 });
  CREATED.push(s.id);
} else f = s.children.find((c) => c.type === "FRAME" && c.name === P.frame);
for (const k of P.cards) {
  if (k.board) {
    /* Review notes board: one column per kind, a note card per item (title, body, affects, answer, status). */
    const TONE = { warn: "#fff4d6", accent: "#e8efff", ok: "#e3f6e8" };
    const row = await F(f, { name: "Board" + (k.part ? " · part " + k.part : ""), dir: "H", w: 1700, gap: 16 });
    row.counterAxisAlignItems = "MIN";
    for (const col of k.board) {
      const c = await F(row, { name: "Column · " + col.title, fillW: true, pad: 16, gap: 12, radius: 8, bg: "surface" });
      c.strokes = [{ type: "SOLID", color: hex("#e6e6e6") }]; c.strokeWeight = 1;
      await T(c, col.title + " · " + col.items.length, { style: "Heading/(H3) Subsection Title", fillW: true });
      for (const it of col.items) {
        const card = await F(c, { name: "Note · " + it.title, fillW: true, pad: 12, gap: 6, radius: 6 });
        card.fills = [{ type: "SOLID", color: hex(TONE[col.tone] || "#f5f5f5") }];
        await T(card, (it.done ? "✓ " : "") + it.title, { style: "Paragraph/Default/Bold", fillW: true });
        if (it.body) await T(card, it.body, { style: "Paragraph/Default/Regular", fillW: true });
        if (it.affects) await T(card, "Affects: " + it.affects, { style: "Paragraph/Small/Regular", color: "textSecondary", fillW: true });
        await T(card, it.answer ? "Answer: " + it.answer : "Answer: —", { style: "Paragraph/Small/Regular", color: "textSecondary", fillW: true });
      }
      if (!col.items.length) await T(c, "Nothing here.", { style: "Paragraph/Small/Regular", color: "textSecondary", fillW: true });
    }
    continue;
  }
  if (k.kpis) {
    const row = await F(f, { name: "KPIs · Scope facts", dir: "H", w: 1700, gap: 16 });
    for (const [label, value] of k.kpis) { const b = await F(row, { name: "KPI · " + label, fillW: true, pad: 24, gap: 4, radius: 4, bg: "surface" }); await T(b, value, { style: "Heading/(H2) Section Title", fillW: true }); await T(b, label, { style: "Paragraph/Small/Regular", color: "textSecondary", fillW: true }); }
    continue;
  }
  await card(f, k.title, k.note, k.cols, k.rows);
}
s.resizeWithoutConstraints(1900, f.height + 200);
return { created: CREATED, warnings: [...new Set(WARN)] };`;
}
/* A board too big for one call is split into several boards with up to 8 notes per column. */
function splitBoard(review) {
  const b = review?.[0]?.board; if (!b) return [];
  const n = Math.max(1, ...b.map((c) => Math.ceil(c.items.length / 8)));
  return Array.from({ length: n }, (_, i) => ({ board: b.map((c) => ({ ...c, items: c.items.slice(i * 8, i * 8 + 8) })), part: n > 1 ? i + 1 : 0 }));
}
export function docsCalls(ctx, pageId, mainId, data, only = null) {
  const calls = [];
  const sections = [[data.handoffName, "Handoff", data.handoffTitle, data.handoffSub, data.handoff], [data.reviewName, "Review notes", data.reviewTitle, data.reviewSub, splitBoard(data.review)], [data.comparisonName, "Comparison", data.comparisonTitle, data.comparisonSub, data.comparison]];
  for (const [name, frame, title, sub, cards] of sections) {
    if (only && !only.includes(frame)) continue;
    let part = { name, frame, title, sub, cards: [] };
    const flush = () => { if (part.cards.length) calls.push(docsPartCode(ctx, pageId, mainId, part)); part = { name, frame, title, sub, cards: [] }; };
    for (const k0 of cards) {
      const k = k0.kpis || k0.board ? k0 : { ...k0, title: clip(k0.title, 120), note: clip(k0.note, 300), rows: k0.rows.map((r) => r.map((c) => clip(c))) };
      /* A card bigger than one call on its own is split by rows. */
      const pieces = [];
      if (k.rows && docsPartCode(ctx, pageId, mainId, { ...part, cards: [k] }).length > CODE_LIMIT) {
        let cur = { ...k, rows: [] };
        for (const row of k.rows) { const next = { ...cur, rows: [...cur.rows, row] }; if (cur.rows.length && docsPartCode(ctx, pageId, mainId, { ...part, cards: [next] }).length > CODE_LIMIT) { pieces.push(cur); cur = { ...k, title: k.title + " (cont.)", note: "", rows: [row] }; } else cur = next; }
        pieces.push(cur);
      } else pieces.push(k);
      for (const piece of pieces) {
        if (part.cards.length && docsPartCode(ctx, pageId, mainId, { ...part, cards: [...part.cards, piece] }).length > CODE_LIMIT) flush();
        part.cards.push(piece);
      }
    }
    flush();
  }
  return calls;
}

export function screensCode(ctx, pageId, sectionId, body) {
  return `${helpers(ctxFor(ctx, body), pageId)}
const SECTION_ID = ${JSON.stringify(sectionId)};
${body}
await growShells();
await placeOverlays();
return { created: CREATED, warnings: [...new Set(WARN)], snaps: SNAPS };`;
}

/* ---------- Content for the Feature Card and the documentation sections ---------- */
const W = (arr, total = 1652) => { const s = arr.reduce((a, b) => a + b, 0); const k = (total - 16 * (arr.length - 1)) / s; return arr.map((v) => Math.floor(v * k)); };
export function cardTexts(pageName, ado, res, cfg, pipe) {
  const id = draftIdOf(pageName);
  const prd = res.prd || {};
  const first = (s) => String(s || "").split(/(?<=\.)\s/).slice(0, 2).join(" ");
  const ov = (prd["2.1"]?.content || "").match(/Overview:\s*(.+)/)?.[1] || first(prd["3.1"]?.content) || ado.title;
  const scopeIn = (prd["3.4"]?.content || "").split(/Out of scope:/i);
  const problem = [
    `Draft · from ${ado.id || "ADO"} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    "", "Current problem", prd["3.1"]?.content || "Not provided by the ADO.",
    "", "Acceptance criteria", ...res.validation.filter((v) => v.status !== "Blocked").slice(0, 8).map((v) => `${v.ac} · ${v.requirement}`), res.validation.length > 8 ? `+ ${res.validation.length - 8} more in the Handoff` : "",
    "", "Out of scope", (scopeIn[1] || "Not provided by the ADO.").trim(),
    "", "Review gates", res.ux.gaps.slice(0, 4).map((g) => g.title).join(" · ") + ". No inferred approvals.",
  ].filter((l) => l !== undefined).join("\n");
  const feat = (ado.title || "New feature").replace(/\s*\(.*?\)/g, "");
  return {
    name: `${id} · Feature Card — ${feat}`,
    mainName: `${id} · Main design — ${feat} · Draft`,
    texts: {
      "Page Title": feat.replace(/\s+–\s+/, "\n"),
      "Feature description": ov,
      __problem: problem,
      "ADO Ticket: Link": [`ADO work item: ${ado.id || "TBD"}${ado.link ? " · " + ado.link : ""}`, `Journey node: ${pipe.journeyNode}`, cfg.sotUrl ? `Source of truth: ${cfg.sotUrl}` : "", `Design system: ${cfg.dsName}`].filter(Boolean).join("\n"),
      "PO Lead: Name": `Product Owner: ${ado.po || "TBD"}`,
      "Tech Lead: Name": ado.stakeholders ? `Stakeholders: ${ado.stakeholders}` : "Engineering Lead: TBD",
      "Designer: Name": "Design: proposal for review",
    },
  };
}

/* Follow the handoff structure of the file / SOT: when a reference card covers the same topic with the
   same number of columns, its column names and widths are used. */
const TOPIC = [[/ac coverage|requirement|coverage/i, /ac coverage|requirement|coverage/i], [/open questions|release gates/i, /question|decision|gate/i], [/accessib/i, /accessib/i], [/system|regional|behavio/i, /system|behavio|region|lifecycle/i], [/recommendation|status/i, /recommend|status|next step/i], [/stories/i, /stor/i]];
function followRef(cards, refCards) {
  if (!refCards?.length) return cards;
  return cards.map((c) => {
    if (!c.cols) return c;
    const t = TOPIC.find(([mine]) => mine.test(c.title));
    const ref = t && refCards.find((rc) => t[1].test(rc.name) && rc.head?.length === c.cols.length);
    if (!ref) return c;
    const cols = ref.head.map((h, i) => { const [label, w] = h.split(":"); return [label || c.cols[i][0], Number(w) > 40 ? Number(w) : c.cols[i][1]]; });
    const total = cols.reduce((a, x) => a + x[1], 0);
    return { ...c, cols: total > 1700 || total < 1200 ? cols.map(([l], i) => [l, c.cols[i][1]]) : cols };
  });
}
export function docsData(pageName, ado, res, ctx, plan, cfg) {
  const d = docsDataBase(pageName, ado, res, ctx, plan, cfg);
  return { ...d, handoff: followRef(d.handoff, (ctx.handoff || ctx.sot?.handoff)?.cards) };
}
function docsDataBase(pageName, ado, res, ctx, plan, cfg) {
  const id = draftIdOf(pageName);
  const feat = (ado.title || "New feature").replace(/\s*\(.*?\)/g, "");
  const screensFor = (ac) => plan.filter((s) => (s.acs || "").includes(ac)).map((s) => s.id.split(".").pop().padStart(2, "0")).join(" / ") || "—";
  const c4 = W([240, 590, 160, 614]);
  const openQ = res.reviewNotes.openQuestions.filter((q) => !q.done);
  const c = res.driftColumns;
  return {
    handoffName: `${id} · Handoff — AC coverage, behavior, questions & accessibility`,
    handoffTitle: `${feat} · Handoff for review`,
    handoffSub: `${id} · from ${ado.id || "ADO"} · Draft · ${res.engine} · approvals pending`,
    handoff: [
      { title: "AC coverage — every acceptance criterion", note: `Screen numbers refer to ${id}.x. Acceptance coverage is a design mapping, not a test-case claim.`, cols: [["Requirement", c4[0]], ["Expected behavior", c4[1]], ["Screen", c4[2]], ["Validation / decision", c4[3]]],
        rows: res.validation.map((v) => [`${v.ac}${v.status === "Blocked" ? " · Blocked" : v.status.startsWith("Doc") ? " · Dev note" : ""}`, v.requirement, v.status === "Designed" ? screensFor(v.ac) : v.status.startsWith("Doc") ? "dev note" : "—", v.questions && v.questions !== "—" ? v.questions : v.recs]) },
      { title: "User stories — readiness", note: "Quality of each story as written in the work item.", cols: [["Story", W([300, 200, 1100])[0]], ["Quality", W([300, 200, 1100])[1]], ["Critique", W([300, 200, 1100])[2]]],
        rows: res.stories.map((s) => [`${s.id} · ${s.text}`, s.rating, s.critique]) },
      { title: "Open questions & release gates", note: "Gaps are kept visible. Owners are proposed, not assigned.", cols: [["Decision", W([310, 470, 290, 534])[0]], ["Impact", W([310, 470, 290, 534])[1]], ["Proposed owner", W([310, 470, 290, 534])[2]], ["Before build / release", W([310, 470, 290, 534])[3]]],
        rows: [...res.ux.gaps.map((g) => [`${g.title} (${g.severity})`, g.detail, g.category === "Accessibility" ? "Design + Engineering" : g.category === "Permissions" ? "Product + Security" : "Product Owner", g.ask]), ...openQ.map((q) => [q.title, q.body, "Product Owner", q.affects || "—"])] },
      { title: "System & regional behavior", note: "How the feature differs across markets and design-system strictness.", cols: [["Aspect", W([220, 300, 300, 300, 500])[0]], [c.primary, W([220, 300, 300, 300, 500])[1]], [c.variantA, W([220, 300, 300, 300, 500])[2]], [c.variantB, W([220, 300, 300, 300, 500])[3]], ["Implementation rule", W([220, 300, 300, 300, 500])[4]]],
        rows: res.drift.map((d) => [d.aspect, d.primary, d.variantA, d.variantB, d.rec]) },
      { title: "Accessibility & interaction handoff", note: "Implementation acceptance checks. A static Figma design cannot verify keyboard or screen-reader behavior.", cols: [["Area", W([260, 900, 460])[0]], ["Expected behavior", W([260, 900, 460])[1]], ["Verification", W([260, 900, 460])[2]]],
        rows: res.reviewNotes.accessibility.map((a) => [a.title, a.body, a.affects || "Test with keyboard and screen reader"]) },
      { title: "Recommendation & handoff status", note: "Proposal for design review. No stakeholder sign-off is implied.", cols: [["Step", W([320, 1316])[0]], ["Action", W([320, 1316])[1]]],
        rows: [["1 · Review this flow", `Walk the ${plan.length} screens with ${ado.po || "the Product Owner"}.`], ["2 · Resolve open questions", `${res.ux.gaps.length + openQ.length} decisions listed above.`], ...res.reviewNotes.recommendations.slice(0, 5).map((r, i) => [`${i + 3} · ${r.title}`, r.body]), [`${Math.min(res.reviewNotes.recommendations.length, 5) + 3} · Sign-off`, "Attach the final ADO and obtain Product, Design and Engineering approval."]] },
    ],
    reviewName: `${id} · Review notes — open questions, recommendations & accessibility`,
    reviewTitle: `${feat} · Review notes`,
    reviewSub: `${id} · for the review with ${ado.po || "the Product Owner"}${ado.stakeholders ? ` and ${ado.stakeholders}` : ""} · answers and decisions go back into the pipeline`,
    review: [{ board: [
      { title: "Open questions", tone: "warn", items: [...res.reviewNotes.openQuestions, ...res.ux.gaps.filter((g) => !res.reviewNotes.openQuestions.some((q) => q.title === g.title)).map((g) => ({ title: g.title, body: g.ask || g.detail, affects: g.category, answer: g.answer || "", done: false }))].map((q) => ({ title: clip(q.title, 90), body: clip(q.body, 260), affects: clip(q.affects || "", 120), answer: clip(q.answer || "", 200), done: !!q.done })) },
      { title: "Recommendations", tone: "accent", items: res.reviewNotes.recommendations.map((q) => ({ title: clip(q.title, 90), body: clip(q.body, 260), affects: clip(q.affects || "", 120), answer: clip(q.answer || "", 200), done: !!q.done })) },
      { title: "Accessibility", tone: "ok", items: res.reviewNotes.accessibility.map((q) => ({ title: clip(q.title, 90), body: clip(q.body, 260), affects: clip(q.affects || "", 120), answer: clip(q.answer || "", 200), done: !!q.done })) },
    ] }],
    comparisonName: `${id} · Comparison — existing Figma, design system & new requirements`,
    comparisonTitle: "Approach comparison · Existing Figma + design system",
    comparisonSub: `One ADO-driven proposal. Same structure as ${ctx.refPage || "the reference page"}.`,
    comparison: [
      { kpis: [["Pages in the sitemap", String(ctx.sitemap.length)], ["Acceptance criteria traced", String(res.validation.length)], ["Designed UI states", String(plan.length)], ["Open questions", String(res.ux.gaps.length + openQ.length)]] },
      { title: "Design system vs. source of truth", note: `Design system (base): ${cfg.dsName}. Source of truth: ${ctx.sot ? ctx.sot.pages.join(" · ") : "not read"}. Where they differ, the design follows the SOT for structure and component use and the design system for tokens.`, cols: [["Aspect", W([260, 700, 660])[0]], ["Drift", W([260, 700, 660])[1]], ["Decision", W([260, 700, 660])[2]]], rows: res.drift.map((d) => [d.aspect, d.drift, d.rec]) },
      { title: "Method and caveats", note: "Evidence is limited to the ADO, the PRD template, the design-system package and the Figma file read before generating.", cols: [["Source", W([320, 1316])[0]], ["What was used", W([320, 1316])[1]]],
        rows: [["Figma file", `${ctx.sitemap.length} pages inventoried; reference page “${ctx.refPage || "—"}”; ${Object.keys(ctx.exemplars).length} library components and ${Object.keys(ctx.styles).length} text styles reused.`], ["Source of truth", ctx.sot ? `${ctx.sot.pages.join(" · ")}: ${ctx.sot.screens.length} screens, ${ctx.sot.modals.length} modal patterns and ${ctx.sot.handoff ? "its handoff structure" : "no handoff"} used as the reference for structure, components and handoff.` : "Not read (no SOT URL)."], ["Design system", `${cfg.dsName}: tokens and component rules used as the base.`], ["Work item", `${ado.id || "ADO"} · ${res.validation.length} acceptance criteria · ${res.stories.length} stories.`], ["Analysis", `${res.engine}. Ratings and gaps need Product Owner review.`], ["Limits", "Screens are a draft built from library components; data in tables is illustrative. Review in Figma before handoff."]] },
    ],
  };
}

/* ---------- Prompts ---------- */
/* Designer comments lead the Figma prompts: they are the designer's decisions for this feature. */
export function notesBlock(notes, images = 0) {
  const t = String(notes || "").trim();
  if (!t) return "";
  return `DESIGNER COMMENTS · the product designer's decisions for this feature. Apply every comment that concerns the screens (which screens and states exist, layout, components, copy, flows, what to avoid). They win over the reference page and the SOT when the two disagree; where a comment conflicts with the acceptance criteria, follow the comment and keep the AC visible in the screen's description.${images ? ` ${images} image(s) from the comments are attached, in the order of the [Image n] markers.` : ""}
"""
${t}
"""

`;
}

export function planPrompt(brief, contextText, draftId, notes = "", images = 0) {
  return `You plan the screens for a Figma [Draft] page, following the reference page in the file.
Return ONLY JSON: {"screens":[ ... ]}. Each screen: {"id":"${draftId}.N","name":"Screen name","state":"state or variant, short","acs":"AC ids this screen covers, e.g. AC-01 · AC-07","desc":"one sentence: what this screen shows and why","crumbs":["Breadcrumb","Items"]}
Rules:
- Number N from 1. 8–14 screens. Cover every AC marked Designed in the validation matrix.
- Like the reference, include the states the brief implies: empty / no results, error with recovery, loading, no permission, confirmation dialogs, warnings, success.
- Names follow the reference style, e.g. "Store list · synced market", "Failed sync · actionable error".
- When the context has a DESIGNER REFERENCE, it leads: continue the work it started (same screen naming, split and order; reuse the screens it already has as the base for the matching ones). Otherwise, when there is a SOURCE OF TRUTH section, follow how its real screens are named, split and ordered (which states get their own screen, how modals and confirmations are shown).
- When there are DESIGNER COMMENTS, the plan must apply them: add, drop, split or order screens as they say, and say in "desc" which comment a screen applies. Add "notes": "what the designer asked for this screen" to each screen a comment affects.

${notesBlock(notes, images)}${contextText}

BRIEF:
${brief}`;
}

export function batchPrompt(brief, contextText, screens, draftId, prevError, maxChars = 12000, notes = "", images = 0) {
  return `You write Figma Plugin API JavaScript that builds product screens inside an existing design file, reusing its library components exactly the way the reference page does.

Your code runs after a prelude that switched to the right page and defines these async helpers. Use ONLY them (no figma.create*, no setCurrentPageAsync, no return, no IIFE). Top-level await is allowed; await every helper.
- const screen = await shell({ id, name, state, acs, desc, crumbs, index }) → returns { frame, content, desk }.
    Creates one screen by cloning the reference screen of THIS file: caption (title · AC line · description) plus the file's own app chrome (header, navigation, breadcrumb), placed in the Main design grid. content = the vertical auto-layout content frame of that screen (its width follows the reference). index = 0-based position of the screen on the page (given below).
- await pageHeader(content, "Title", [{ label: "Action", icon: "add", props: { Hierachy: "Secondary" } }])  → title row with library Buttons.
- await I(parent, "<Library component name>", { props: { Variant: "value" }, text: "label" | ["t1","t2"], icon: "name" | ["leading", "trailing"], fillW, w, h, name })  → library instance; props are variant properties shown in the context; text sets the component's text property or its text layers in order; icon puts icons from "Icons available" in the component's icon slots (use null for a side you don't want).
- await clone(parent, "<Library component name>", { fillW, name })  → exact copy of the reference instance (composites such as "Filter" or "Advanced Pagination"); then await setTexts(node, ["text 1", ...]) to change its visible texts in order.
- await table(parent, ["HEADER", ...], [["cell", ...], ...], { pagination: true|false, pages: 156 })  → the reference library Data Table; respect its column count, row limit and which columns are Tag columns (see context).
- await tabs(parent, ["Tab 1", "Tab 2"])  → library Tabs Navigation with these labels (first is active).
- const { body } = await modal(screen, { kind: "modal"|"sidepanel", title, text, actions: [{ label: "Cancel" }, { label: "Confirm", primary: true, icon: "check" }], width })  → draws the dialog ON TOP of the screen like the product does: scrim below the top bar, modal centered or side panel docked right at full height. screen = the object returned by shell(). Put fields, notices or tables into body.
- await notice(parent, "Info"|"Success"|"Warning"|"Error", "Title", "Message", ["Action"])  → library Notification; omit actions to hide its buttons.
- await F(parent, { name, dir: "H"|"V", gap, pad, px, py, fillW, fillH, w, h, align: "CENTER"|"MIN"|"MAX", justify: "MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN", bg: "surface"|"canvas", radius, wrap })  → auto-layout frame.
- await T(parent, "text", { style: "<text style name>", color: "textPrimary"|"textSecondary", fillW, w, name })  → text with the file's text styles.

Rules:
- Build exactly these screens, in order:
${screens.map((s) => `  index ${s.index}: ${JSON.stringify({ id: s.id, name: s.name, state: s.state, acs: s.acs, desc: s.desc, crumbs: s.crumbs, ...(s.notes ? { notes: s.notes } : {}) })}`).join("\n")}
- Apply the DESIGNER COMMENTS (and each screen's "notes") in the layout, components, labels and states you build; they win over the reference and the SOT.
- Follow the reference anatomy order inside Content: Breadcrumb (from shell) → Page header → context line (Paragraph/Small/Regular, textSecondary) → Tabs / filters → dataset title + actions → summary line → Data Table / form / message → secondary actions.
- Every screen keeps the app chrome of the shell (top header, side navigation): never remove or rebuild it.
- Desktop screens are 1080 px tall by default; the app makes a screen taller only when its content needs it. Don't add filler to reach the height, don't stretch content to fill it, and don't resize the screen yourself.
- Confirmations, warnings, edit forms and download dialogs are overlays: build the screen underneath as usual, then call modal(screen, …). Never place a dialog inside the content flow. Use kind "sidepanel" where the SOT uses side panels for editing.
- When the context has a DESIGNER REFERENCE, build each screen like its closest screen there: same components and variants, same order inside the content, same table columns, filters, notices and modal pattern; change only what this screen's ACs and the designer comments require. The SOT and other references fill only what it doesn't show.
- Mix the references: the design system in the brief is the base (tokens, component rules); the SOURCE OF TRUTH section shows how the product applies it. Build screens, modals, empty/error states and tables the way the SOT does (structure, which component goes where, action order in dialogs); prefer components marked SOT.
- Component names: use the names listed under "Library components available" in the context. Role names (App Header, Sidebar Navigation, Data Table, Notification, Tabs Navigation, Tab, Modal, Breadcrumb, Button, Input, Dropdown, Tag, Toggle, Checkbox, Filter, Advanced Pagination, Card) are mapped to this file's equivalent automatically, so they are safe too. Never invent other names.
- Build every control from a library component (buttons, inputs, dropdowns, toggles, tags, tabs, tables, messages, dialogs). Plain frames only for layout; T only for headings and body text.
- Prefer library components over frames. Use real labels and realistic sample data from the brief. Status always as Tag with words. One primary Button per screen.
- Icons: suggest an icon for every Button (pageHeader actions, modal actions, I(…, "Button")) that matches its action: add, edit, delete, download, upload, filter, search, refresh, swap/change, settings, back… Add a trailing arrow (["…", "arrow_forward"]) only on actions that move the user forward. Use only names listed under "Icons available"; if none fits, leave the icon out. Icon-only buttons and table/row actions follow the SOT. Never set the components' state, hover or icon-visibility properties yourself.
- Dialogs/warnings: build the underlying screen, then call modal(screen, …); inline warnings inside the page use notice().
- HARD LIMIT: under ${Math.min(maxChars, 4500 * screens.length).toLocaleString()} characters in total (Figma rejects longer code). Define small local helper functions and loops to avoid repetition; keep sample data short.
- Answer with JavaScript only. No Markdown fences, no prose.${prevError ? `\n- The previous attempt failed with: ${prevError}. Avoid it.` : ""}

${notesBlock(notes, images)}${contextText}

BRIEF:
${brief}`;
}
