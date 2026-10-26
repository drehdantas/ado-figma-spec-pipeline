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
  if ("children" in n) { o.kids = n.children.slice(0, 30).map((c) => ({ id: c.id, type: c.type, name: c.name, x: R(c.x), y: R(c.y), w: R(c.width), h: R(c.height) })); o.kidCount = n.children.length; }
  if (n.type === "SECTION" && n.fills?.[0]) o.fill = hexOf(n.fills[0]);
  out.top.push(o);
}
// Screens: frames whose name starts with a journey id, inside sections or at top level
const screenFrames = page.findAll((n) => n.type === "FRAME" && /^[A-Z]\\d+(\\.\\d+)+\\s*·/.test(n.name) && (n.parent.type === "SECTION" || n.parent.type === "PAGE"));
out.screens = screenFrames.slice(0, 40).map((f) => ({ id: f.id, name: f.name, w: R(f.width), h: R(f.height), x: R(f.x), y: R(f.y), parent: f.parent.name }));
// Exemplars: first instance of each component (set) on the page
const insts = page.findAllWithCriteria({ types: ["INSTANCE"] });
const seen = new Set();
for (const i of insts) {
  if (Object.keys(out.exemplars).length >= 45) break;
  let mc; try { mc = await i.getMainComponentAsync(); } catch {}
  if (!mc) continue;
  const set = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null;
  const nm = set ? set.name : mc.name;
  if (seen.has(nm) || /^_|^(Navigation|Action|Hardware|Content|Social|Editor|AudioVideo|Alert|Communication|Image|Device|File|Maps|Places|Toggle)\\//.test(nm)) continue;
  seen.add(nm);
  let props = {}; try { props = Object.fromEntries(Object.entries(i.componentProperties).map(([k, v]) => [k, v.value])); } catch {}
  out.exemplars[nm] = { id: i.id, key: mc.key, setKey: set ? set.key : null, variant: mc.name, props, w: R(i.width), h: R(i.height), texts: i.findAll((t) => t.type === "TEXT").slice(0, 6).map((t) => t.name) };
}
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
if (screenFrames[0]) { out.screenAnatomy = (await tree(screenFrames[0], 0)).slice(0, 80).join("\\n"); out.screenExemplar = screenFrames[0].id; }
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
return out;`;

/* Merge one or more reference digests into the context the generator uses. */
export function mergeContext(sitemap, refs, fileKey) {
  const ex = {}, styles = {}, vars = {};
  let screenExemplar = null, featureCard = null, handoff = null, anatomy = null, refPage = null, tableCols = null, tableRows = 8;
  for (const r of refs) {
    if (!r) continue;
    Object.entries(r.exemplars || {}).forEach(([k, v]) => { if (!ex[k]) ex[k] = { ...v, page: r.page }; });
    (r.styles || []).forEach((s) => { if (!styles[s.name]) styles[s.name] = s; });
    if (!tableCols && r.tableCols) { tableCols = r.tableCols; tableRows = r.tableRows; }
    (r.vars || []).forEach((v) => { if (!vars[v.name]) vars[v.name] = v; });
    if (!screenExemplar && r.screenExemplar) { screenExemplar = r.screenExemplar; anatomy = r.screenAnatomy; refPage = r.page; }
    if (!featureCard && r.featureCard) featureCard = r.featureCard;
    if (!handoff && r.handoff) handoff = r.handoff;
  }
  return { fileKey, analyzedAt: new Date().toISOString(), sitemap, refs: refs.filter(Boolean).map((r) => ({ page: r.page, pageId: r.pageId, top: r.top, screens: r.screens })), exemplars: ex, styles, vars, screenExemplar, anatomy, featureCard, handoff, refPage, tableCols, tableRows };
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
    handoffCards: ctx.handoff?.cards?.map((c) => c.name.replace(/^Card · /, "")) || [],
    featureCard: !!ctx.featureCard,
    shell: !!ctx.screenExemplar,
  };
}

/* Compact text the screen-writing prompt gets. */
export function contextForPrompt(ctx) {
  const ex = Object.entries(ctx.exemplars).map(([k, v]) => `- ${k}: variant {${Object.entries(v.props || {}).filter(([pk]) => !/#/.test(pk)).map(([pk, pv]) => `${pk}=${pv}`).join(", ")}}${Object.keys(v.props || {}).some((pk) => /^Text#/.test(pk)) ? " · text prop" : ""} · ${v.w}x${v.h}`).join("\n");
  const sitemap = ctx.sitemap.map((p) => p.name).join("\n");
  const refScreens = ctx.refs.flatMap((r) => (r.screens || []).map((s) => `- ${s.name} (${s.w}x${s.h})`)).slice(0, 30).join("\n");
  return `FIGMA FILE CONTEXT (read from the file before designing)
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
Reference Data Table: ${ctx.tableCols ? `${ctx.tableCols.length} columns (${ctx.tableCols.map((c, i) => `${i + 1}:${c}`).join(", ")}; "tag" columns render the value as a status Tag), up to ${ctx.tableRows} rows` : "—"}
Handoff cards in the reference: ${(ctx.handoff?.cards || []).map((c) => c.name).join(" · ") || "—"}`;
}
