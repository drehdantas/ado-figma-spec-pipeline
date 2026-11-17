/* Read-only analysis of a Figma file: sitemap, reference [Draft] pages, how components, styles and variables are applied. */

export const SITEMAP_CODE = `return figma.root.children.map((p, i) => ({ id: p.id, name: p.name, index: i }));`;

export const refPageCode = (pageId) => `
const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
await figma.setCurrentPageAsync(page);
const R = (v) => Math.round(v);
const hexOf = (p) => p && p.type === "SOLID" ? "#" + [p.color.r, p.color.g, p.color.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("") : null;
const out = { pageId: page.id, page: page.name, top: [], screens: [], exemplars: {}, styles: {}, vars: {}, handoff: null, featureCard: null, screenAnatomy: null, screenExemplar: null };
for (const n of page.children) {
  const o = { id: n.id, type: n.type, name: n.name, x: R(n.x), y: R(n.y), w: R(n.width), h: R(n.height) };
  if ("children" in n) { o.kids = n.children.slice(0, 14).map((c) => ({ id: c.id, type: c.type, name: c.name, x: R(c.x), y: R(c.y), w: R(c.width), h: R(c.height) })); o.kidCount = n.children.length; }
  if (n.type === "SECTION" && n.fills?.[0]) o.fill = hexOf(n.fills[0]);
  out.top.push(o);
}
// Screens: frames named with a journey id (J4.1.1.1 · …). Files that name screens freely ("Order details",
// "Checkout - Web Desktop") are detected by shape instead: large frames in sections or on the page that use library instances.
const NAMED = /^[A-Z]\\d+(\\.\\d+)+\\s*·/;
const topFrames = page.findAll((n) => n.type === "FRAME" && (n.parent.type === "SECTION" || n.parent.type === "PAGE"));
let screenFrames = topFrames.filter((n) => NAMED.test(n.name));
const instCount = (f) => { try { return f.findAllWithCriteria({ types: ["INSTANCE"] }).length; } catch { return 0; } };
if (!screenFrames.length) {
  screenFrames = topFrames.filter((f) => f.width >= 960 && f.height >= 560).map((f) => ({ f, n: instCount(f) })).filter((x) => x.n >= 3).sort((a, b) => b.n - a.n).map((x) => x.f);
  out.screensBy = "shape";
}
out.screens = screenFrames.slice(0, 40).map((f) => ({ id: f.id, name: f.name, w: R(f.width), h: R(f.height), x: R(f.x), y: R(f.y), parent: f.parent.name }));
// Exemplars: the library components the page actually uses, most used first. Icons, browser chrome and
// private sub-parts are skipped so they don't crowd out headers, navigation, tables, forms and messages.
const SKIP = /^_|^\\d+px\\/|^icon\\b|\\bicons?\\s*\\/|^(Navigation|Action|Hardware|Content|Social|Editor|AudioVideo|Alert|Communication|Image|Device|File|Maps|Places|Toggle)\\/|browser|broswer|checkmark|scroller|^cursor/i;
const insts = page.findAllWithCriteria({ types: ["INSTANCE"] }).slice(0, 4000);
const tally = new Map();
// Icons: the icon components this page uses (name, key, id), so new screens can put real icons in buttons.
const ICONRE = /^icons?\\b|\\bicons?\\s*\\/|^\\d+px\\/|^(Navigation|Action|Hardware|Content|Social|Editor|AudioVideo|Alert|Communication|Image|Device|File|Maps|Places|Toggle)\\//i;
const NOTICON = /checkbox|radio|toggle|switch|avatar|logo|flag|button|tag|chip|badge/i;
const icons = new Map();
for (const i of insts) {
  const small = i.width <= 48 && i.height <= 48;
  if (!small && i.width <= 24 && i.height <= 24) continue;
  let mc; try { mc = await i.getMainComponentAsync(); } catch {}
  if (!mc) continue;
  const set = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null;
  const nm = set ? set.name : mc.name;
  if (ICONRE.test(nm) || (small && !NOTICON.test(nm) && !i.findOne((k) => k.type === "TEXT") && !!i.findOne((k) => k.type === "VECTOR" || k.type === "BOOLEAN_OPERATION"))) {
    const iname = (set ? set.name + "/" + Object.values(mc.variantProperties || {}).join("/") : mc.name).slice(0, 60);
    const t = icons.get(iname); if (t) t[3]++; else icons.set(iname, [iname, mc.key, mc.remote ? null : mc.id, 1]);
    continue;
  }
  if (i.width <= 24 && i.height <= 24) continue;
  if (SKIP.test(nm) && !/^_(cell|header ?item|row)/i.test(nm)) continue;
  const t = tally.get(nm);
  if (t) { t.n++; continue; }
  tally.set(nm, { n: 1, i, mc, set });
}
for (const [nm, { n, i, mc, set }] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 45)) {
  let props = {}, swaps = []; try { props = Object.fromEntries(Object.entries(i.componentProperties).filter(([, v]) => v.type !== "INSTANCE_SWAP").map(([k, v]) => [k, typeof v.value === "string" ? v.value.slice(0, 40) : v.value])); swaps = Object.entries(i.componentProperties).filter(([, v]) => v.type === "INSTANCE_SWAP").map(([k]) => k.split("#")[0]); } catch {}
  out.exemplars[nm] = { id: i.id, key: mc.key, setKey: set ? set.key : null, variant: mc.name.slice(0, 80), props, uses: n, w: R(i.width), h: R(i.height), texts: i.findAll((t) => t.type === "TEXT").slice(0, 3).map((t) => t.name.slice(0, 30)) };
  if (swaps.length) out.exemplars[nm].swaps = swaps;
}
out.icons = [...icons.values()].sort((a, b) => b[3] - a[3]).slice(0, 150);
// Text styles and color variables in use
const texts = page.findAllWithCriteria({ types: ["TEXT"] }).slice(0, 2500);
for (const t of texts) {
  if (typeof t.textStyleId === "string" && t.textStyleId) {
    if (!out.styles[t.textStyleId]) { const s = await figma.getStyleByIdAsync(t.textStyleId); if (s) out.styles[t.textStyleId] = { name: s.name, key: s.key, id: s.id, remote: s.remote, n: 0, size: typeof t.fontSize === "number" ? t.fontSize : null }; }
    if (out.styles[t.textStyleId]) out.styles[t.textStyleId].n++;
  }
  const a = t.boundVariables && t.boundVariables.fills && t.boundVariables.fills[0];
  if (a && !out.vars[a.id] && Object.keys(out.vars).length < 40) { const v = await figma.variables.getVariableByIdAsync(a.id); if (v) out.vars[a.id] = { name: v.name, key: v.key, hex: hexOf(t.fills[0]), use: "text" }; }
}
const frames = page.findAllWithCriteria({ types: ["FRAME"] }).slice(0, 2500);
for (const f of frames) {
  const a = f.boundVariables && f.boundVariables.fills && f.boundVariables.fills[0];
  if (a && !out.vars[a.id] && Object.keys(out.vars).length < 40) { const v = await figma.variables.getVariableByIdAsync(a.id); if (v) out.vars[a.id] = { name: v.name, key: v.key, hex: hexOf(f.fills[0]), use: "fill" }; }
}
out.styles = Object.values(out.styles).sort((a, b) => b.n - a.n);
out.vars = Object.values(out.vars);
// Screen anatomy (first screen), compact
async function tree(n, d) {
  let s = n.type === "INSTANCE" ? "◆" : n.type === "TEXT" ? "T" : n.type === "FRAME" ? "▢" : n.type;
  s += " " + n.name;
  if ("layoutMode" in n && n.layoutMode && n.layoutMode !== "NONE") s += " [" + n.layoutMode[0] + " gap" + n.itemSpacing + " p" + n.paddingTop + "]";
  s += " " + R(n.width) + "x" + R(n.height);
  if (n.type === "TEXT") s += ' "' + n.characters.slice(0, 40).replace(/\\n/g, " ") + '"';
  const lines = [s];
  if ("children" in n && n.type !== "INSTANCE" && d < 4) for (const c of n.children.slice(0, 16)) (await tree(c, d + 1)).forEach((l) => lines.push("  " + l));
  return lines;
}
// The screen to clone as shell: one with app chrome (a bar along the top, navigation along the left)
// and no overlay open (scrim, modal, side panel).
const OVER = /scrim|overlay|modal|dialog|side ?panel|drawer|popover|toast/i;
function shellScore(f) {
  const D = f.absoluteBoundingBox; let top = false, left = false, over = false;
  for (const n of f.findAll((k) => k.visible && (k.type === "FRAME" || k.type === "INSTANCE" || k.type === "GROUP"))) {
    const b = n.absoluteBoundingBox; if (!b) continue;
    const rx = b.x - D.x, ry = b.y - D.y;
    if (ry <= 4 && b.width >= D.width * 0.6 && b.height <= 160) top = true;
    if (rx <= 4 && b.width <= 340 && b.height >= D.height * 0.45) left = true;
    if (OVER.test(n.name) && b.width >= 280 && n.parent && (n.parent === f || n.parent.parent === f)) over = true;
  }
  return (top ? 400 : 0) + (left ? 400 : 0) - (over ? 1000 : 0) + Math.min(300, instCount(f));
}
const ranked = screenFrames.slice(0, 30).map((f) => ({ f, s: shellScore(f) })).sort((a, b) => b.s - a.s);
if (ranked[0]) { out.screenAnatomy = (await tree(ranked[0].f, 0)).slice(0, 80).join("\\n"); out.screenExemplar = ranked[0].f.id; out.shellScore = ranked[0].s; out.shellName = ranked[0].f.name; }
// Handoff pattern
const ho = page.findOne((n) => n.type === "FRAME" && /^handoff$/i.test(n.name));
if (ho) {
  out.handoff = { id: ho.id, w: R(ho.width), cards: ho.children.filter((c) => c.type === "FRAME").map((c) => {
    const tbl = c.findOne((k) => k.type === "FRAME" && /^Table/.test(k.name));
    const head = tbl && tbl.children[0] ? tbl.children[0].children.filter((k) => k.type === "TEXT").map((k) => k.characters + ":" + R(k.width)) : [];
    return { id: c.id, name: c.name, head };
  }) };
}
const dt = page.findOne((n) => n.type === "INSTANCE" && n.name === "Data Table");
if (dt) {
  const row = dt.findOne((n) => n.type === "INSTANCE" && /^_Row/.test(n.name));
  out.tableCols = row ? row.children.filter((c) => /^_Cell/.test(c.name)).map((c) => (c.findOne((k) => k.type === "INSTANCE" && /Tag/.test(k.name)) ? "tag" : "text")) : null;
  out.tableRows = dt.findAll((n) => n.type === "INSTANCE" && /^_Row/.test(n.name)).length;
}
const fc = page.findOne((n) => n.type === "INSTANCE" && /Feature Card/i.test(n.name));
if (fc) out.featureCard = { id: fc.id, w: R(fc.width), h: R(fc.height), texts: fc.findAll((t) => t.type === "TEXT").map((t) => t.name.slice(0, 40)) };
// Modals, dialogs and side panels: how the product builds them (structure, actions, sizes).
const MOD = /modal|dialog|drawer|side ?panel|sheet|popover/i;
const mods = page.findAll((n) => (n.type === "FRAME" || n.type === "INSTANCE" || n.type === "COMPONENT") && MOD.test(n.name) && n.width >= 280 && n.width <= 1100 && n.height >= 120).slice(0, 40);
const seenM = new Set(); out.modals = [];
for (const m of mods) {
  const key = m.name + "|" + R(m.width);
  if (seenM.has(key) || out.modals.length >= 3) continue; seenM.add(key);
  let lines;
  if (m.type === "INSTANCE") {
    let props = {}; try { props = Object.fromEntries(Object.entries(m.componentProperties).map(([k, v]) => [k.split("#")[0], v.value])); } catch {}
    lines = ["◆ " + m.name + " " + R(m.width) + "x" + R(m.height) + " props " + JSON.stringify(props).slice(0, 240), ...m.findAll((t) => t.type === "TEXT" && t.visible).slice(0, 8).map((t) => '  T "' + t.characters.slice(0, 50).replace(/\\n/g, " ") + '"')];
  } else lines = (await tree(m, 1)).slice(0, 30);
  out.modals.push({ name: m.name, w: R(m.width), h: R(m.height), anatomy: lines.join("\\n") });
}
out.screenNames = screenFrames.slice(0, 40).map((f) => f.name);
// How screens are built here, learned across up to 12 screens by position (names vary per file):
// bars stacked at the top, navigation down the left, bars at the bottom, breadcrumb, page title size, overlays.
const L = { n: 0, top: {}, left: {}, bottom: {}, crumb: 0, title: {}, modal: {}, side: {}, scrim: 0, width: {} };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const within = (n, set) => { let p = n.parent; while (p) { if (set.has(p)) return true; p = p.parent; } return false; };
for (const f of screenFrames.slice(0, 12)) {
  L.n++; const D = f.absoluteBoundingBox; bump(L.width, R(D.width));
  const nodes = f.findAll((k) => k.visible && (k.type === "FRAME" || k.type === "INSTANCE" || k.type === "GROUP" || k.type === "RECTANGLE") && k.absoluteBoundingBox).map((k) => { const b = k.absoluteBoundingBox; return { k, rx: b.x - D.x, ry: b.y - D.y, w: b.width, h: b.height }; });
  const got = new Set(); let top = 0;
  for (const c of nodes.slice().sort((a, b) => a.ry - b.ry)) {
    if (c.k.type === "RECTANGLE") continue;
    if (c.ry <= top + 4 && c.rx <= 4 && c.w >= D.width * 0.6 && c.h <= 160 && c.ry + c.h > top && !within(c.k, got)) { got.add(c.k); bump(L.top, c.k.name.slice(0, 40) + " " + R(c.h) + "px"); top = c.ry + c.h; }
  }
  for (const c of nodes) if (c.k.type !== "RECTANGLE" && c.rx <= 4 && c.w <= 340 && c.h >= (D.height - top) * 0.45 && c.ry <= top + 8 && !within(c.k, got) && !got.has(c.k)) { got.add(c.k); bump(L.left, c.k.name.slice(0, 40) + " " + R(c.w) + "px"); }
  for (const c of nodes) if (c.k.type !== "RECTANGLE" && c.ry + c.h >= D.height - 4 && c.h <= 120 && c.w >= D.width * 0.5 && c.ry > D.height * 0.5 && !within(c.k, got) && !got.has(c.k)) { got.add(c.k); bump(L.bottom, c.k.name.slice(0, 40)); }
  if (nodes.some((c) => /bread ?crumb/i.test(c.k.name))) L.crumb++;
  const big = f.findAll((t) => t.type === "TEXT" && t.visible && typeof t.fontSize === "number" && t.fontSize >= 20).map((t) => ({ t, ry: t.absoluteBoundingBox.y - D.y })).filter((x) => x.ry < top + 220).sort((a, b) => a.ry - b.ry)[0];
  if (big) bump(L.title, R(big.t.fontSize) + "px");
  for (const c of nodes) {
    if (/scrim|overlay/i.test(c.k.name) || (c.k.type === "RECTANGLE" && c.w >= D.width * 0.9 && c.h >= D.height * 0.5 && c.k.opacity < 1)) { L.scrim++; continue; }
    if (!OVER.test(c.k.name) || c.w < 280) continue;
    if (c.rx + c.w >= D.width - 4 && c.h >= D.height * 0.5) bump(L.side, c.k.name.slice(0, 30) + " " + R(c.w) + "px");
    else bump(L.modal, c.k.name.slice(0, 30) + " " + R(c.w) + "px");
  }
}
const top3 = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + " (" + v + "/" + L.n + ")").join(" + ");
out.layout = L.n ? { screens: L.n, width: top3(L.width), top: top3(L.top), left: top3(L.left), bottom: top3(L.bottom), breadcrumb: L.crumb + "/" + L.n, title: top3(L.title), modal: top3(L.modal), sidepanel: top3(L.side), scrim: L.scrim } : null;
// use_figma answers are capped at 48 KB: shrink the least important parts until it fits.
const size = () => JSON.stringify(out).length;
const MAXB = 24000;
if (size() > MAXB) { out.top = out.top.map((t) => ({ ...t, kids: (t.kids || []).slice(0, 4) })); }
if (size() > MAXB) { out.screens = out.screens.slice(0, 16); out.screenNames = out.screenNames.slice(0, 16); }
if (size() > MAXB) { for (const v of Object.values(out.exemplars)) { delete v.texts; delete v.variant; } out.icons = out.icons.slice(0, 100); }
if (size() > MAXB) { out.modals = out.modals.map((m) => ({ ...m, anatomy: m.anatomy.split("\\n").slice(0, 10).join("\\n") })); out.screenAnatomy = out.screenAnatomy && out.screenAnatomy.split("\\n").slice(0, 50).join("\\n"); }
while (size() > MAXB && Object.keys(out.exemplars).length > 15) { const ks = Object.keys(out.exemplars); delete out.exemplars[ks[ks.length - 1]]; }
if (size() > MAXB) { out.top = out.top.map(({ kids, ...t }) => t); out.vars = out.vars.slice(0, 15); }
if (size() > MAXB) out.icons = out.icons.slice(0, 60);
return out;`;

/* Merge one or more reference digests into the context the generator uses. */
export function mergeContext(sitemap, refs, fileKey) {
  const ex = {}, styles = {}, vars = {}, icons = {};
  let screenExemplar = null, featureCard = null, handoff = null, anatomy = null, refPage = null, tableCols = null, tableRows = 8, shellScore = -1e9, shellName = null;
  const layouts = [];
  for (const r of refs) {
    if (!r) continue;
    Object.entries(r.exemplars || {}).forEach(([k, v]) => { if (!ex[k]) ex[k] = { ...v, page: r.page }; });
    (r.styles || []).forEach((s) => { if (!styles[s.name]) styles[s.name] = s; });
    if (!tableCols && r.tableCols) { tableCols = r.tableCols; tableRows = r.tableRows; }
    (r.vars || []).forEach((v) => { if (!vars[v.name]) vars[v.name] = v; });
    (r.icons || []).forEach(([n, key, id, uses]) => { if (icons[n]) icons[n][3] += uses; else icons[n] = [n, key, id, uses]; });
    /* Best shell across pages: app chrome present, no overlay open. A page the designer pointed to wins
       whenever one of its screens has the app chrome. */
    const bonus = r.designer && (r.shellScore ?? 0) >= 400 ? 1e6 : 0;
    if (r.screenExemplar && (r.shellScore ?? 0) + bonus > shellScore) { screenExemplar = r.screenExemplar; anatomy = r.screenAnatomy; refPage = r.page; shellScore = (r.shellScore ?? 0) + bonus; shellName = r.shellName || null; }
    if (r.layout) layouts.push({ page: r.page, designer: !!r.designer, ...r.layout });
    if (!featureCard && r.featureCard) featureCard = r.featureCard;
    if (!handoff && r.handoff) handoff = r.handoff;
  }
  return { fileKey, analyzedAt: new Date().toISOString(), sitemap, refs: refs.filter(Boolean).map((r) => ({ page: r.page, pageId: r.pageId, top: r.top, screens: r.screens })), exemplars: ex, styles, vars, screenExemplar, anatomy, featureCard, handoff, refPage, tableCols, tableRows, shellScore, shellName, layouts: layouts.sort((a, b) => (b.designer ? 1e6 : 0) - (a.designer ? 1e6 : 0) || b.screens - a.screens).slice(0, 3), icons: Object.values(icons).sort((a, b) => b[3] - a[3]).slice(0, 200) };
}

/* The screen structure learned from existing screens, as rules the generator must follow. */
export function layoutText(ls) {
  if (!ls || !ls.length) return "";
  return `SCREEN STRUCTURE LEARNED FROM EXISTING SCREENS (follow it on every screen):
${ls.map((l) => `- ${l.page} (${l.screens} screens, width ${l.width || "?"}): top ${l.top || "none"} · left navigation ${l.left || "none"} · bottom bar ${l.bottom || "none"} · breadcrumb on ${l.breadcrumb} · page title ${l.title || "?"} · modals ${l.modal || "none"} · side panels ${l.sidepanel || "none"}${l.scrim ? " · overlays sit on a scrim" : ""}`).join("\n")}
Keep the same top bars, left navigation, breadcrumb position, title size and bottom bar; show dialogs as the modals / side panels listed, on a scrim.`;
}
export function layoutSummary(ctx) {
  const l = [...(ctx.layouts || []), ...(ctx.sot?.layouts || [])].sort((a, b) => (b.designer ? 1e6 : 0) - (a.designer ? 1e6 : 0) || b.screens - a.screens)[0];
  return l || null;
}

/* Which page holds a node (the SOT URL's node-id may point at a page or at something on it). */
export const nodePageCode = (nodeId) => `
const n = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
let p = n; while (p && p.type !== "PAGE") p = p.parent;
return p ? { id: p.id, name: p.name } : null;`;

/* Counts real screens on every page (large frames in sections or on the page), so reference pages are
   chosen by content, not by naming conventions. Cover, start, archive and separator pages are skipped. */
export const PAGE_SCAN_CODE = `
const out = [];
for (const p of figma.root.children) {
  const nm = p.name.trim();
  if (/archive|cover|start here|as-is/i.test(nm) || (/^[-—–=_\\s]/.test(nm) && !/[A-Z]\\d/.test(nm))) { out.push({ id: p.id, name: p.name, skip: true }); continue; }
  try { await p.loadAsync(); } catch (e) {}
  const fr = p.findAll((n) => n.type === "FRAME" && (n.parent.type === "SECTION" || n.parent.type === "PAGE") && n.width >= 960 && n.height >= 560);
  out.push({ id: p.id, name: p.name, screens: fr.length });
}
return out;`;

const jid = (name) => (String(name || "").match(/[A-Z]\d+(?:\.\d+)*/) || [""])[0];
const isFeature = (name) => /^\s*[↳⮑↪➥➔→>»]/.test(name);
const isJunk = (name) => /archive|cover|start here|as-is/i.test(name) || (/^[\s\-—–=_]/.test(name.trim()) && !/[A-Z]\d/.test(name));

/* Reference pages: the most screen-rich pages, same journey first, then the link's page if it has screens.
   Works with any naming (↳, ⮑, " - ", " · ") because it ranks by what the pages contain. */
export function pickSotPages(sitemap, urlPageId, journeyNode, scan = null, max = 3) {
  const j = jid(journeyNode).split(".")[0];
  const count = (id) => scan?.find((x) => x.id === id)?.screens ?? null;
  const pages = sitemap.filter((p) => !isJunk(p.name) && !/\[draft\]/i.test(p.name));
  const score = (p) => {
    const n = count(p.id);
    const sameJ = j && jid(p.name).split(".")[0] === j;
    return (n === null ? (isFeature(p.name) ? 5 : 1) : n) + (sameJ ? 1000 : 0) + (isFeature(p.name) ? 2 : 0);
  };
  const ranked = pages.filter((p) => count(p.id) === null || count(p.id) > 0).sort((a, b) => score(b) - score(a));
  const out = [];
  if (urlPageId && (count(urlPageId) ?? 1) > 0 && !isJunk(sitemap.find((p) => p.id === urlPageId)?.name || "")) out.push(urlPageId);
  for (const p of ranked) { if (out.length >= max) break; if (!out.includes(p.id)) out.push(p.id); }
  return out;
}

/* Adds the source-of-truth reading to the context. Same file: its screens and components are used
   directly (the shell is cloned from the SOT). Another file: components come in by library key and the
   SOT's anatomy, modals and handoff guide the structure. */
export function mergeSot(ctx, { fileKey, sameFile, sitemap, refs, viewOnly = false, fileName = "" }) {
  const ok = refs.filter(Boolean);
  if (!ok.length) return ctx;
  const ex = { ...ctx.exemplars };
  const sotOnly = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.exemplars || {})) {
    if (ex[k]) { ex[k] = { ...ex[k], uses: (ex[k].uses || 0) + (v.uses || 0), sot: true }; continue; }
    /* View-only reads have names but no component keys: they guide choices but can't be placed. */
    if (!v.key) { sotOnly[k] = (sotOnly[k] || 0) + (v.uses || 1); continue; }
    ex[k] = { ...v, id: sameFile ? v.id : null, page: r.page, sot: true };
  }
  const styles = { ...ctx.styles }; for (const r of ok) (r.styles || []).forEach((st) => { if (!styles[st.name]) styles[st.name] = sameFile ? st : { ...st, id: null }; });
  const vars = { ...ctx.vars }; for (const r of ok) (r.vars || []).forEach((v) => { if (!vars[v.name]) vars[v.name] = v; });
  const icons = Object.fromEntries((ctx.icons || []).map((x) => [x[0], [...x]]));
  for (const r of ok) for (const [n, key, id, uses] of r.icons || []) {
    if (icons[n]) { icons[n][3] += uses; continue; }
    if (key || sameFile) icons[n] = [n, key, sameFile ? id : null, uses];
  }
  const shell = ok.find((r) => r.screenExemplar);
  const sotLayouts = ok.filter((r) => r.layout).map((r) => ({ page: r.page, ...r.layout }));
  const out = {
    ...ctx, exemplars: ex, styles, vars, icons: Object.values(icons).sort((a, b) => b[3] - a[3]).slice(0, 200),
    sot: {
      fileKey, fileName, sameFile, viewOnly, sotOnly, readAt: new Date().toISOString(), pages: ok.map((r) => r.page), pageCount: sitemap?.length || 0,
      anatomy: shell?.screenAnatomy || null,
      screens: [...new Set(ok.flatMap((r) => r.screenNames || (r.screens || []).map((x) => x.name)))].slice(0, 40),
      modals: [...new Map(ok.flatMap((r) => r.modals || []).map((m) => [m.name + "|" + m.w, m])).values()].slice(0, 3),
      handoff: ok.find((r) => r.handoff)?.handoff || null,
      tableCols: ok.find((r) => r.tableCols)?.tableCols || null,
      layouts: sotLayouts,
    },
  };
  /* Same file: the SOT's screen is the better shell to clone. */
  const bestSot = ok.filter((r) => r.screenExemplar).sort((a, b) => (b.shellScore ?? 0) - (a.shellScore ?? 0))[0];
  if (sameFile && bestSot && (bestSot.shellScore ?? 0) >= (ctx.shellScore ?? -1e9)) { out.screenExemplar = bestSot.screenExemplar; out.anatomy = bestSot.screenAnatomy; out.refPage = bestSot.page; out.shellScore = bestSot.shellScore; out.shellName = bestSot.shellName; }
  if (!out.handoff && sameFile) out.handoff = out.sot.handoff;
  if (!out.featureCard && sameFile) out.featureCard = ok.find((r) => r.featureCard)?.featureCard || null;
  if (!out.tableCols && out.sot.tableCols) out.tableCols = out.sot.tableCols;
  return out;
}

/* Pick variable keys by role from what the reference uses. */
export function roleVars(ctx) {
  const v = Object.values(ctx.vars || {});
  const pick = (re, hex) => v.find((x) => re.test(x.name)) || v.find((x) => x.hex === hex && /semantic|background|surface|text/i.test(x.name)) || v.find((x) => x.hex === hex);
  return {
    textPrimary: pick(/text\/primary$|text.*primary/i, "#2d2d2d"),
    textSecondary: pick(/text\/secondary$|text.*(secondary|subtle|muted)/i, "#4b4b4b"),
    canvas: pick(/background\/default$|canvas|background\/page/i, "#f5f9ff"),
    surface: pick(/background\/layer-01$|surface\/default|background\/surface/i, "#ffffff"),
  };
}

export function contextSummary(ctx) {
  if (!ctx) return null;
  return {
    pages: ctx.sitemap.length,
    refs: ctx.refs.map((r) => r.page),
    components: Object.keys(ctx.exemplars),
    styles: Object.keys(ctx.styles),
    vars: Object.keys(ctx.vars).length,
    screens: ctx.refs.reduce((a, r) => a + (r.screens?.length || 0), 0),
    handoffCards: (ctx.handoff || ctx.sot?.handoff)?.cards?.map((c) => c.name.replace(/^Card · /, "")) || [],
    sot: ctx.sot ? { pages: ctx.sot.pages, sameFile: ctx.sot.sameFile, viewOnly: !!ctx.sot.viewOnly, fileKey: ctx.sot.fileKey, readAt: ctx.sot.readAt, modals: ctx.sot.modals.length, modalNames: ctx.sot.modals.map((m) => m.name), screens: ctx.sot.screens.length, handoff: !!ctx.sot.handoff, components: Object.values(ctx.exemplars).filter((v) => v.sot).length + Object.keys(ctx.sot.sotOnly || {}).length } : null,
    featureCard: !!ctx.featureCard,
    shell: !!ctx.screenExemplar,
  };
}

/* Compact text the screen-writing prompt gets. */
export function contextForPrompt(ctx) {
  const ex = Object.entries(ctx.exemplars).map(([k, v]) => `- ${k}: variant {${Object.entries(v.props || {}).filter(([pk]) => !/#/.test(pk) && !/state|hover|focus|press/i.test(pk)).map(([pk, pv]) => `${pk}=${pv}`).join(", ")}}${Object.keys(v.props || {}).some((pk) => /^Text#/.test(pk)) ? " · text prop" : ""}${v.swaps?.length ? ` · icon slots: ${v.swaps.join(", ")}` : ""} · ${v.w}x${v.h}${v.uses ? ` · used ${v.uses}×` : ""}${v.sot ? " · SOT" : ""}`).join("\n");
  const sitemap = ctx.sitemap.map((p) => p.name).join("\n");
  const refScreens = ctx.refs.flatMap((r) => (r.screens || []).map((s) => `- ${s.name} (${s.w}x${s.h})`)).slice(0, 30).join("\n");
  return `${designerText(ctx)}FIGMA FILE CONTEXT (read from the file before designing)
Sitemap (page order):
${sitemap}

Reference page: ${ctx.refPage || "—"}
Reference screens (naming and state coverage to follow):
${refScreens || "—"}

Reference screen anatomy (copy this structure; ◆ = library instance, ▢ = frame, T = text):
${ctx.anatomy || "—"}

Library components available (use these names with I(), and the variant props shown):
${ex}

Text styles in use: ${Object.keys(ctx.styles).join(" · ")}
${iconsText(ctx)}
Reference Data Table: ${ctx.tableCols ? `${ctx.tableCols.length} columns (${ctx.tableCols.map((c, i) => `${i + 1}:${c}`).join(", ")}; "tag" columns render the value as a status Tag), up to ${ctx.tableRows} rows` : "—"}
Handoff cards in the reference: ${(ctx.handoff?.cards || []).map((c) => c.name).join(" · ") || "—"}
${layoutText([...(ctx.layouts || []), ...(ctx.sot?.layouts || [])])}${ctx.sot ? `

SOURCE OF TRUTH (SOT) — how the product really applies the design system${ctx.sot.sameFile ? " (same file; the screen shell above comes from it)" : ` (file ${ctx.sot.fileKey}; its components are imported by library key)`}
Pages read: ${ctx.sot.pages.join(" · ")}
Real screens and states (naming, coverage and order to follow):
${ctx.sot.screens.map((n) => `- ${n}`).join("\n") || "—"}
${ctx.sot.anatomy && !ctx.sot.sameFile ? `SOT screen anatomy (rebuild this structure with library components):\n${ctx.sot.anatomy}\n` : ""}Modals / dialogs / panels as the SOT builds them (copy size, structure, title, body and action order):
${ctx.sot.modals.map((m) => `${m.name} ${m.w}x${m.h}\n${m.anatomy}`).join("\n\n") || "—"}
SOT handoff cards: ${(ctx.sot.handoff?.cards || []).map((c) => `${c.name.replace(/^Card · /, "")} [${c.head.map((h) => h.split(":")[0]).join(" | ")}]`).join(" · ") || "—"}
Components marked "SOT" in usage are the ones the product actually uses: prefer them.${Object.keys(ctx.sot.sotOnly || {}).length ? `
Also used in the SOT (map each to the closest library component above): ${Object.entries(ctx.sot.sotOnly).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} ×${n}`).join(" · ")}` : ""}` : ""}`;
}

/* Icon names the screen code may ask for: the file's icon components, then the design-system package's SVGs. */
export function iconsText(ctx) {
  const lib = [...new Set((ctx.icons || []).map((x) => iconName(x[0])))].filter(Boolean).slice(0, 120);
  const pkg = Object.keys(ctx.dsSvgs || {}).filter((n) => !lib.includes(n)).slice(0, 120);
  if (!lib.length && !pkg.length) return "Icons available: none found (leave buttons without icons).";
  return `Icons available (use these names with icon:): ${lib.join(", ") || "—"}${pkg.length ? `\nIcons in the design-system package (SVG, also usable with icon:): ${pkg.join(", ")}` : ""}`;
}
export const iconName = (s) => String(s || "").toLowerCase().replace(/\.svg$/, "").split("/").map((p) => p.replace(/^[a-z ]+=\s*/, "").trim()).filter((p) => p && !/^(icons?|\d+(px)?|small|medium|large|xs|sm|md|lg|outlined|outline|filled|fill|rounded|sharp|default|regular|true|false)$/.test(p)).pop()?.replace(/^(ic|icon)[-_ ]+/, "").replace(/[^a-z0-9]+/g, " ").trim() || "";

const SYN = [["add", "plus", "new", "create"], ["edit", "pencil", "modify", "mode edit"], ["delete", "trash", "remove", "bin", "delete outline"], ["close", "x", "clear", "dismiss", "cancel"], ["search", "magnify", "magnifier", "find"], ["download", "file download", "export", "get app"], ["upload", "file upload", "import", "publish"], ["filter", "filter list", "funnel", "tune", "filter alt"], ["more", "more vert", "more horiz", "dots", "kebab", "overflow"], ["arrow forward", "arrow right", "chevron right", "next", "forward", "arrow right alt", "east"], ["arrow back", "arrow left", "chevron left", "back", "previous", "west"], ["refresh", "sync", "autorenew", "reload", "retry", "replay"], ["swap", "swap horiz", "sync alt", "change", "switch", "compare arrows"], ["check", "done", "tick", "success", "check circle", "confirm"], ["info", "information", "info outline"], ["warning", "alert", "report problem", "error outline", "error"], ["settings", "gear", "cog"], ["calendar", "event", "date", "calendar today"], ["person", "user", "account", "profile", "account circle"], ["store", "storefront", "shop", "retailer"], ["open in new", "external", "launch", "link"], ["copy", "content copy", "duplicate"], ["visibility", "eye", "view", "preview"], ["help", "question", "help outline"], ["save", "floppy"], ["logout", "exit", "sign out"], ["menu", "hamburger"], ["expand more", "chevron down", "arrow drop down", "keyboard arrow down"], ["expand less", "chevron up", "keyboard arrow up"], ["notifications", "bell", "notification"], ["home", "house"], ["send", "submit"], ["lock", "locked"], ["history", "schedule", "clock", "time"]];
/* Fuzzy match of a requested icon name against a list of names: exact, synonym, then by words. */
export function matchIcon(want, names) {
  const w = iconName(want); if (!w) return null;
  const norm = names.map((n) => [n, iconName(n)]);
  const exact = norm.find(([, m]) => m === w); if (exact) return exact[0];
  const group = SYN.find((g) => g.includes(w));
  if (group) for (const alt of group) { const hit = norm.find(([, m]) => m === alt); if (hit) return hit[0]; }
  const words = w.split(" ");
  const cands = norm.filter(([, m]) => words.every((x) => m.split(" ").includes(x))).sort((a, b) => a[1].length - b[1].length);
  if (cands[0]) return cands[0][0];
  if (group) for (const alt of group) { const hit = norm.filter(([, m]) => m.split(" ").includes(alt.split(" ")[0])).sort((a, b) => a[1].length - b[1].length)[0]; if (hit) return hit[0]; }
  return null;
}
/* The icons a batch of screen code asks for, resolved to the file's components or the package's SVGs. */
export function resolveIcons(body, ctx) {
  const asked = new Set();
  for (const m of String(body || "").matchAll(/\bicons?\s*:\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g)) for (const q of m[1].matchAll(/["']([^"']+)["']/g)) asked.add(q[1]);
  if (/modal\s*\(/.test(body || "")) asked.add("close");
  const lib = ctx.icons || [], libNames = lib.map((x) => x[0]);
  const svgs = ctx.dsSvgs || {}, svgNames = Object.keys(svgs);
  const out = {};
  for (const a of asked) {
    const hit = matchIcon(a, libNames);
    if (hit) { const x = lib.find((y) => y[0] === hit); out[a] = { k: x[1] || null, id: x[2] || null }; continue; }
    const sv = matchIcon(a, svgNames);
    if (sv) out[a] = { svg: svgs[sv] };
  }
  return out;
}

/* ---------- Designer reference: pages the designer points to in the comments ---------- */
/* Figma links (any file) and page mentions by journey id ("J9.4") or page title. */
export function notesRefs(notes, sitemap = [], skipPageIds = []) {
  const t = String(notes || "");
  const urls = [];
  for (const m of t.matchAll(/https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto)\/([A-Za-z0-9]{10,})(?:\/branch\/([A-Za-z0-9]{10,}))?[^\s)\]"'<>]*/g)) {
    const nid = (m[0].match(/node-id=(\d+)[-:%3A]+(\d+)/i) || []);
    const u = { fileKey: m[2] || m[1], nodeId: nid[1] ? `${nid[1]}:${nid[2]}` : null, url: m[0] };
    if (!urls.some((x) => x.fileKey === u.fileKey && x.nodeId === u.nodeId)) urls.push(u);
  }
  const text = t.replace(/https?:\/\/\S+/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  const low = text.toLowerCase();
  const pages = [];
  for (const p of sitemap) {
    if (skipPageIds.includes(p.id)) continue;
    const clean = p.name.replace(/^[↳\s]+/, "").replace(/\s*\[draft\]\s*$/i, "").trim();
    const id = (clean.match(/^([A-Z]\d+(?:\.\d+)*)/) || [])[1];
    const title = clean.replace(/^[A-Z]\d+(?:\.\d+)*\s*[-–—·:|]?\s*/, "").trim();
    const idHit = !!id && id.includes(".") && new RegExp(`(^|[^\\w.])${id.replace(/\./g, "\\.")}(?![\\w]|\\.\\d)`, "i").test(text);
    const titleHit = title.length >= 6 && low.includes(title.toLowerCase());
    if (idHit || titleHit) pages.push({ pageId: p.id, name: p.name, score: (idHit ? 2 : 0) + (titleHit ? 1 : 0) + (/\[draft\]/i.test(p.name) ? 0.5 : 0) });
  }
  pages.sort((a, b) => b.score - a.score);
  const top = pages.slice(0, 3);
  const sig = JSON.stringify([...urls.map((u) => `${u.fileKey}|${u.nodeId || ""}`), ...top.map((p) => p.pageId)].sort());
  return { urls, pages: top, sig, any: urls.length + top.length > 0 };
}

/* Several screens of a page (or of a linked frame / section) with their full content structure:
   the work the designer already started, to be followed screen by screen. */
export const designerPageCode = (pageId, nodeId) => `
let page = ${pageId ? `await figma.getNodeByIdAsync(${JSON.stringify(pageId)})` : "figma.currentPage"};
if (!page) return { error: "page not found" };
await figma.setCurrentPageAsync(page);
const R = (v) => Math.round(v);
let root = ${nodeId ? `await figma.getNodeByIdAsync(${JSON.stringify(nodeId)})` : "null"};
if (!root || root.type === "PAGE" || root.type === "DOCUMENT") root = page;
const big = (f) => f.width >= 900 && f.height >= 500;
const cnt = (f) => { try { return f.findAllWithCriteria({ types: ["INSTANCE"] }).length; } catch (e) { return 0; } };
let frames;
if ((root.type === "FRAME" || root.type === "COMPONENT") && big(root)) frames = [root];
else frames = root.findAll((n) => (n.type === "FRAME" || n.type === "COMPONENT") && big(n) && n.parent && (n.parent.type === "SECTION" || n.parent.type === "PAGE" || n.parent === root)).slice(0, 80);
const ranked = frames.map((f) => ({ f, n: cnt(f) })).filter((x) => x.n >= 3);
const order = (a, b) => (a.absoluteBoundingBox.y - b.absoluteBoundingBox.y) || (a.absoluteBoundingBox.x - b.absoluteBoundingBox.x);
const pick = ranked.slice().sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.f).sort(order);
async function tree(n, d, lines, pad, max) {
  if (lines.length >= max || !n.visible) return;
  let s = pad + (n.type === "INSTANCE" ? "◆" : n.type === "TEXT" ? "T" : n.type === "FRAME" ? "▢" : n.type) + " " + n.name.slice(0, 48);
  if (n.type === "INSTANCE") {
    try { const mc = await n.getMainComponentAsync(); if (mc) { const set = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent.name : mc.name; if (set !== n.name) s += " <" + set.slice(0, 40) + ">"; const vp = mc.variantProperties; if (vp) { const v = Object.entries(vp).filter(([k]) => !/state|hover|focus|press/i.test(k)).map(([k, x]) => k + "=" + x).join(", "); if (v) s += " {" + v.slice(0, 90) + "}"; } } } catch (e) {}
    const tx = n.findAll((t) => t.type === "TEXT" && t.visible).slice(0, 3).map((t) => t.characters.slice(0, 28).replace(/\\s+/g, " "));
    if (tx.length) s += ' "' + tx.join(" | ") + '"';
  }
  if ("layoutMode" in n && n.layoutMode && n.layoutMode !== "NONE") s += " [" + n.layoutMode[0] + " gap" + n.itemSpacing + "]";
  s += " " + R(n.width) + "x" + R(n.height);
  if (n.type === "TEXT") s += ' "' + n.characters.slice(0, 70).replace(/\\s+/g, " ") + '"';
  lines.push(s);
  if ("children" in n && n.type !== "INSTANCE" && d < 7) for (const c of n.children.slice(0, 20)) await tree(c, d + 1, lines, pad + "  ", max);
}
const out = { page: page.name, pageId: page.id, focus: root !== page ? root.name : null, screens: ranked.map((x) => x.f).sort(order).slice(0, 30).map((f) => f.name), anatomies: [] };
let max = 75;
for (const f of pick) { const lines = []; await tree(f, 0, lines, "", max); out.anatomies.push({ name: f.name, w: R(f.width), h: R(f.height), tree: lines.join("\\n") }); }
while (JSON.stringify(out).length > 42000 && max > 20) { max -= 15; out.anatomies = out.anatomies.map((a) => ({ ...a, tree: a.tree.split("\\n").slice(0, max).join("\\n") })); }
return out;`;

/* The designer reference, as the first and strongest section of the Figma context. */
export function designerText(ctx) {
  const d = ctx.designer;
  if (!d?.refs?.length) return "";
  return `DESIGNER REFERENCE · the designer already started this work and asked (in the designer comments) to follow it. It comes FIRST: copy its screen structure, component choices and variants, layout, copy style, modal pattern and naming. The other references below only fill what it doesn't show.
${d.refs.map((r) => `Page: ${r.page}${r.focus ? ` · frame/section: ${r.focus}` : ""}${r.otherFile ? ` (another file${r.viewOnly ? ", view access" : ""}: rebuild its structure with this file's library components)` : ""}
Screens on it: ${(r.screens || []).join(" · ") || "—"}
${(r.anatomies || []).map((a) => `Screen "${a.name}" (${a.w}x${a.h}):\n${a.tree}`).join("\n\n")}`).join("\n\n")}
`;
}
