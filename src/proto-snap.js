/* A faithful prototype needs what Figma actually drew, not a re-interpretation of the code. Right after a
   batch of screens is built, snapScreens runs inside Figma and records each screen as positioned boxes,
   texts (font, size, weight, color), icons and graphics (as SVG, exported once and reused) and the
   clickable elements. The app chrome (header, side navigation) is stored once and referenced. The browser
   then rebuilds the screens from this record with zero Figma calls. */

/* Runs INSIDE Figma (embedded with toString): keep it self-contained. */
export async function snapScreens(list, opt) {
  const known = { s: new Set((opt && opt.known && opt.known.s) || []), c: new Set((opt && opt.known && opt.known.c) || []) };
  const budget = (opt && opt.budget) || 30000;
  const svgCap = budget * 0.4;
  const R = (v) => Math.round(v);
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const VEC = { VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, POLYGON: 1, LINE: 1, ELLIPSE: 1, REGULAR_POLYGON: 1 };
  const W8 = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, heavy: 900, black: 900 };
  const weightOf = (style) => { const k = String(style || "").toLowerCase().replace(/italic|oblique|\s|-/g, ""); return W8[k] || 400; };
  const colorOf = (c, a) => (a < 0.995 ? "rgba(" + R(c.r * 255) + "," + R(c.g * 255) + "," + R(c.b * 255) + "," + Math.round(a * 100) / 100 + ")" : "#" + [c.r, c.g, c.b].map((v) => R(v * 255).toString(16).padStart(2, "0")).join(""));
  const paintOf = (fills) => {
    if (!Array.isArray(fills)) return null;
    for (let i = fills.length - 1; i >= 0; i--) {
      const p = fills[i]; if (p.visible === false) continue;
      const op = p.opacity === undefined ? 1 : p.opacity; if (op <= 0.001) continue;
      if (p.type === "SOLID") return colorOf(p.color, op);
      if (p.type && p.type.indexOf("GRADIENT") === 0 && p.gradientStops && p.gradientStops.length) { const g = p.gradientStops[0]; return colorOf(g.color, (g.color.a === undefined ? 1 : g.color.a) * op); }
      if (p.type === "IMAGE") return "IMG";
    }
    return null;
  };
  const roleOf = (txt) => {
    const t = txt.toLowerCase();
    if (/tabs navigation|tab ?bar|button group|sidebar navigation|side navigation|app header|data table|^table\b|breadcrumbs?$|pagination$/.test(t)) return null;
    if (/close|dismiss/.test(t)) return "close";
    if (/(^|[\s/_])tab\b|tab item/.test(t)) return "tab";
    if (/button|btn|\bcta\b/.test(t)) return "button";
    if (/checkbox|radio|toggle|switch/.test(t)) return "toggle";
    if (/dropdown|select|combo|date ?picker|search|input|text ?field|text ?area/.test(t)) return "input";
    if (/nav(igation)? ?item|menu ?item|side ?nav|sidebar ?item|list ?item/.test(t)) return "nav";
    if (/^_?row\b|table ?row|_row/.test(t)) return "row";
    if (/link|crumb/.test(t)) return "link";
    return null;
  };
  const isGraphic = (n) => {
    if (VEC[n.type]) return n.width <= 480 && n.height <= 480;
    if (["INSTANCE", "GROUP", "FRAME", "COMPONENT"].indexOf(n.type) < 0 || n.width > 200 || n.height > 200 || !("findAll" in n)) return false;
    let vec = 0, bad = false;
    n.findAll((k) => { if (bad || !k.visible) return false; if (k.type === "TEXT") bad = true; else if (VEC[k.type]) vec++; else if (Array.isArray(k.fills) && k.fills.some((p) => p.type === "IMAGE" && p.visible !== false)) bad = true; return false; });
    return !bad && vec > 0;
  };
  const svgOut = {}; let svgBytes = 0;
  const out = { screens: [], chrome: {}, svg: svgOut, pending: [] };
  let used = 0;

  async function snapOne(desk) {
    const D = desk.absoluteBoundingBox;
    /* App chrome by position (names vary per file): bars across the top, navigation down the left. */
    const cand = desk.findAll((k) => k.visible && (k.type === "FRAME" || k.type === "INSTANCE" || k.type === "GROUP") && !/scrim|overlay|modal|dialog|side ?panel|drawer|popover|toast/i.test(k.name)).map((k) => ({ b: k.absoluteBoundingBox })).filter((x) => x.b).map((x) => ({ rx: x.b.x - D.x, ry: x.b.y - D.y, w: x.b.width, h: x.b.height }));
    let top = 0; for (const c of cand.slice().sort((a, b) => a.ry - b.ry)) if (c.ry <= top + 4 && c.rx <= 4 && c.w >= D.width * 0.6 && c.h <= 160 && c.ry + c.h > top) top = c.ry + c.h;
    let left = 0; for (const c of cand) if (c.rx <= 4 && c.w <= 340 && c.h >= (D.height - top) * 0.45 && c.ry <= top + 8 && c.rx + c.w > left) left = c.rx + c.w;
    const inChrome = (x, y, w, h) => (top > 0 && y + h <= top + 1) || (left > 0 && x + w <= left + 1 && y >= top - 1);
    const items = []; const hot = [];
    async function walk(n, op, clip) {
      if (!n.visible) return;
      const b = n.absoluteBoundingBox; if (!b) return;
      const x = b.x - D.x, y = b.y - D.y, w = b.width, h = b.height;
      if (clip && (x >= clip[2] || y >= clip[3] || x + w <= clip[0] || y + h <= clip[1])) return;
      const o = op * (n.opacity === undefined ? 1 : n.opacity); if (o <= 0.01) return;
      if (n.isMask) return;
      const geo = [R(x), R(y), R(w), R(h)];
      if (n.type === "INSTANCE" && hot.length < 90) {
        let setName = ""; let variant = "";
        try { const mc = await n.getMainComponentAsync(); if (mc) { variant = mc.name; setName = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent.name : mc.name; } } catch (e) {}
        const role = roleOf(n.name + " " + setName);
        if (role && (w > 24 || h > 24)) {
          const label = n.findAll((t) => t.type === "TEXT" && t.visible).slice(0, 2).map((t) => t.characters.trim()).filter(Boolean).join(" · ").slice(0, 50) || n.name.slice(0, 40);
          hot.push([...geo, role, label, /primary/i.test(variant + " " + n.name) ? 1 : 0]);
        }
      }
      if (n.type === "TEXT") {
        let seg = n;
        try { if (n.fontName === figma.mixed || n.fontSize === figma.mixed || n.fills === figma.mixed || n.lineHeight === figma.mixed || n.letterSpacing === figma.mixed) seg = n.getStyledTextSegments(["fontName", "fontSize", "fills", "lineHeight", "letterSpacing", "textCase", "textDecoration"])[0] || n; } catch (e) {}
        const size = typeof seg.fontSize === "number" ? seg.fontSize : 14;
        const lh = seg.lineHeight && seg.lineHeight.unit === "PIXELS" ? R(seg.lineHeight.value) : seg.lineHeight && seg.lineHeight.unit === "PERCENT" ? R((seg.lineHeight.value / 100) * size) : 0;
        const ls = seg.letterSpacing ? (seg.letterSpacing.unit === "PERCENT" ? Math.round((seg.letterSpacing.value / 100) * size * 100) / 100 : Math.round(seg.letterSpacing.value * 100) / 100) : 0;
        const fam = seg.fontName && seg.fontName !== figma.mixed ? seg.fontName.family : "Inter";
        const sty = seg.fontName && seg.fontName !== figma.mixed ? seg.fontName.style : "Regular";
        const tc = { UPPER: "u", LOWER: "l", TITLE: "t" }[seg.textCase] || "";
        const td = { UNDERLINE: "_", STRIKETHROUGH: "-" }[seg.textDecoration] || "";
        const font = [fam, R(size * 10) / 10, weightOf(sty), /italic|oblique/i.test(sty) ? 1 : 0, lh, ls, tc + td].join("|");
        const color = paintOf(seg.fills) || "#000000";
        const al = (n.textAlignHorizontal || "LEFT")[0] + (n.textAlignVertical || "TOP")[0] + (n.textAutoResize === "WIDTH_AND_HEIGHT" ? "" : "w") + (n.textTruncation === "ENDING" ? "e" : "");
        items.push({ k: "t", g: geo, s: n.characters, f: font, c: color, a: al, o: o < 0.99 ? Math.round(o * 100) / 100 : 1 });
        return;
      }
      if (isGraphic(n)) {
        let key = n.type + "|" + R(w) + "x" + R(h) + "|" + n.name;
        try { if (n.type === "INSTANCE") { const mc = await n.getMainComponentAsync(); if (mc) key = mc.id + "|" + R(w) + "x" + R(h); } } catch (e) {}
        const v = "findOne" in n ? n.findOne((k) => VEC[k.type] && k.visible) : n;
        if (v) key += "|" + (paintOf(v.fills) || "") + (paintOf(v.strokes) || "");
        const id = hash(key);
        if (!known.s.has(id) && !(id in svgOut)) {
          let svg = null;
          try { svg = await n.exportAsync({ format: "SVG_STRING" }); } catch (e) { svg = null; }
          if (svg) svg = svg.replace(/\n\s*/g, "").replace(/>\s+</g, "><");
          if (svg && svg.length <= 9000 && svgBytes + svg.length <= svgCap) { svgOut[id] = svg; svgBytes += svg.length; }
          else { known.s.add("x" + id); }
        }
        if (id in svgOut || known.s.has(id)) { items.push({ k: "s", g: geo, i: id, o: o < 0.99 ? Math.round(o * 100) / 100 : 1 }); return; }
        if (known.s.has("x" + id) && !("children" in n)) return;
      }
      const fill = "fills" in n ? paintOf(n.fills) : null;
      const stroke = "strokes" in n && n.strokes && n.strokes.length ? paintOf(n.strokes) : null;
      let sw = 0;
      if (stroke) {
        if (typeof n.strokeWeight === "number" && !("strokeTopWeight" in n && (n.strokeTopWeight !== n.strokeWeight || n.strokeBottomWeight !== n.strokeWeight || n.strokeLeftWeight !== n.strokeWeight || n.strokeRightWeight !== n.strokeWeight))) sw = n.strokeWeight;
        else if ("strokeTopWeight" in n) sw = [n.strokeTopWeight, n.strokeRightWeight, n.strokeBottomWeight, n.strokeLeftWeight];
        else sw = 1;
      }
      let rad = 0;
      if (n.type === "ELLIPSE") rad = "50%";
      else if (typeof n.cornerRadius === "number") rad = n.cornerRadius;
      else if ("topLeftRadius" in n) rad = [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius];
      let sh = null;
      if (Array.isArray(n.effects)) { const e = n.effects.find((x) => x.visible !== false && x.type === "DROP_SHADOW"); if (e) sh = [R(e.offset.x), R(e.offset.y), R(e.radius), R(e.spread || 0), colorOf(e.color, e.color.a)]; }
      if (fill === "IMG") items.push({ k: "i", g: geo, r: rad });
      else if (fill || (stroke && sw) || sh) items.push({ k: "b", g: geo, f: fill, s: stroke, w: sw, r: rad, sh, o: o < 0.99 ? Math.round(o * 100) / 100 : 1 });
      if ("children" in n && n.type !== "BOOLEAN_OPERATION") {
        const c2 = n.clipsContent ? [Math.max(clip ? clip[0] : -1e9, x), Math.max(clip ? clip[1] : -1e9, y), Math.min(clip ? clip[2] : 1e9, x + w), Math.min(clip ? clip[3] : 1e9, y + h)] : clip;
        for (const k of n.children) await walk(k, o, c2);
      }
    }
    for (const k of desk.children) await walk(k, 1, [0, 0, D.width, D.height]);
    /* Pack: palettes for colors and fonts, chrome runs replaced by references. */
    const pack = (list) => {
      const cs = [], ci = {}, fs = [], fi = {};
      const C = (c) => (c == null ? -1 : (c in ci ? ci[c] : (ci[c] = cs.push(c) - 1)));
      const Fi = (f) => (f in fi ? fi[f] : (fi[f] = fs.push(f) - 1));
      const n = list.map((it) => it.k === "t" ? ["t", ...it.g, it.s, Fi(it.f), C(it.c), it.a, it.o] : it.k === "s" ? ["s", ...it.g, it.i, it.o] : it.k === "i" ? ["i", ...it.g, it.r] : ["b", ...it.g, C(it.f), C(it.s), it.w, it.r, it.sh ? [...it.sh.slice(0, 4), C(it.sh[4])] : 0, it.o]);
      return { c: cs, f: fs, n };
    };
    const body = []; let run = null;
    const flush = () => { if (!run || !run.length) { run = null; return; } const p = pack(run); const h = hash(JSON.stringify(p)); if (!known.c.has(h) && !out.chrome[h]) out.chrome[h] = p; body.push({ k: "c", h }); run = null; };
    for (const it of items) { if (inChrome(it.g[0], it.g[1], it.g[2], it.g[3])) { (run = run || []).push(it); } else { flush(); body.push(it); } }
    flush();
    const refs = body.filter((x) => x.k === "c").map((x) => x.h);
    const p = pack(body.filter((x) => x.k !== "c"));
    let bi = 0; const n2 = body.map((x) => (x.k === "c" ? ["c", x.h] : p.n[bi++]));
    return { w: R(D.width), h: R(D.height), bg: paintOf(desk.fills), c: p.c, f: p.f, n: n2, hot, chromeRefs: refs };
  }

  for (const [pid, deskId, name, state] of list) {
    const desk = await figma.getNodeByIdAsync(deskId);
    if (!desk) continue;
    if (out.screens.length && (used > budget * 0.8 || svgBytes > svgCap * 0.8)) { out.pending.push([pid, deskId, name, state]); continue; }
    const before = new Set(Object.keys(out.chrome)), svgBefore = new Set(Object.keys(svgOut)), svgB0 = svgBytes;
    const s = await snapOne(desk);
    s.id = pid; s.name = name; s.state = state || "";
    let size = JSON.stringify(s).length;
    if (size > budget) { s.n = s.n.slice(0, Math.max(50, Math.floor(s.n.length * (budget / size)))); s.cut = 1; size = JSON.stringify(s).length; }
    const added = Object.keys(out.chrome).filter((h) => !before.has(h));
    size += added.reduce((a, h) => a + JSON.stringify(out.chrome[h]).length, 0);
    if (out.screens.length && used + size > budget) {
      added.forEach((h) => delete out.chrome[h]);
      Object.keys(svgOut).filter((k) => !svgBefore.has(k)).forEach((k) => delete svgOut[k]); svgBytes = svgB0;
      out.pending.push([pid, deskId, name, state]); continue;
    }
    used += size;
    out.screens.push(s);
  }
  return out;
}

/* Figma code that snapshots screens already on the page (pages built before snapshots existed). */
export function captureCode(pageId, mainId, list, known, budget = 30000) {
  return `const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
if (!page) return { error: "The generated page is no longer in the file." };
await figma.setCurrentPageAsync(page);
let sec = ${mainId ? `await figma.getNodeByIdAsync(${JSON.stringify(mainId)})` : "null"};
if (!sec || sec.type !== "SECTION") sec = page.children.find((c) => c.type === "SECTION" && /main design/i.test(c.name));
if (!sec) return { error: "The Main design section was not found on the page." };
const frames = sec.children.filter((f) => f.type === "FRAME");
let list = ${JSON.stringify(list || null)};
if (!list) list = frames.map((f) => { const desk = f.children.find((k) => /desktop/i.test(k.name)) || (f.children[0] && /^caption/i.test(f.children[0].name) ? f.children[1] : null) || f; const parts = f.name.split(" · "); return [parts[0], desk.id, parts[1] || f.name, parts.slice(2).join(" · ")]; });
const snapScreens = ${snapScreens.toString()};
const r = await snapScreens(list, { known: ${JSON.stringify(known || { s: [], c: [] })}, budget: ${budget} });
return { ...r, total: list.length };`;
}

/* ---------- Browser side: rebuild the screens ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pos = (x, y, w, h) => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
const radius = (r) => (!r ? "" : Array.isArray(r) ? `border-radius:${r.map((v) => v + "px").join(" ")};` : `border-radius:${typeof r === "number" ? r + "px" : r};`);

function renderNodes(list, C, Fo, fonts) {
  let html = "";
  for (const n of list) {
    const [k, x, y, w, h] = n;
    if (k === "b") {
      const [, , , , , f, s, sw, r, sh, o] = n;
      let css = pos(x, y, w, h) + ";";
      if (f >= 0) css += `background:${C[f]};`;
      if (s >= 0 && sw) css += Array.isArray(sw) ? `border-style:solid;border-color:${C[s]};border-width:${sw.map((v) => v + "px").join(" ")};` : `border:${sw}px solid ${C[s]};`;
      css += radius(r);
      if (sh) css += `box-shadow:${sh[0]}px ${sh[1]}px ${sh[2]}px ${sh[3]}px ${C[sh[4]]};`;
      if (o < 1) css += `opacity:${o};`;
      html += `<i class="b" style="${css}"></i>`;
    } else if (k === "t") {
      const [, , , , , str, fi, ci, al, o] = n;
      const [fam, size, wt, it, lh, ls, deco] = String(Fo[fi] || "Inter|14|400|0|0|0|").split("|");
      fonts.add(fam);
      const ha = { L: "left", C: "center", R: "right", J: "justify" }[al[0]] || "left";
      const va = { T: "flex-start", C: "center", B: "flex-end" }[al[1]] || "flex-start";
      let css = pos(x, y, w + (al.includes("w") ? 0 : 2), h) + `;font-family:'${fam}',Inter,system-ui,sans-serif;font-size:${size}px;font-weight:${wt};color:${C[ci] || "#000"};text-align:${ha};justify-content:${va};`;
      if (it === "1") css += "font-style:italic;";
      if (Number(lh)) css += `line-height:${lh}px;`;
      if (Number(ls)) css += `letter-spacing:${ls}px;`;
      if (deco.includes("u")) css += "text-transform:uppercase;"; else if (deco.includes("l")) css += "text-transform:lowercase;"; else if (deco.includes("t")) css += "text-transform:capitalize;";
      if (deco.includes("_")) css += "text-decoration:underline;"; else if (deco.includes("-")) css += "text-decoration:line-through;";
      if (!al.includes("w")) css += "white-space:pre;";
      if (al.includes("e")) css += "overflow:hidden;text-overflow:ellipsis;";
      if (o < 1) css += `opacity:${o};`;
      html += `<span class="x" style="${css}">${esc(str).replace(/\n/g, "<br>")}</span>`;
    } else if (k === "s") {
      const [, , , , , id, o] = n;
      html += `<svg class="g" style="${pos(x, y, w, h)};${o < 1 ? `opacity:${o}` : ""}"><use href="#g${id}"/></svg>`;
    } else if (k === "i") {
      html += `<i class="b img" style="${pos(x, y, w, h)};${radius(n[5])}"></i>`;
    }
  }
  return html;
}

/* Exported SVGs become symbols of one sprite; their internal ids are prefixed so they don't collide. */
export function spriteOf(svg) {
  let out = "";
  for (const [id, s] of Object.entries(svg || {})) {
    const m = s.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i); if (!m) continue;
    const vb = (m[1].match(/viewBox="([^"]+)"/i) || [])[1] || (() => { const w = (m[1].match(/width="([\d.]+)/) || [])[1], h = (m[1].match(/height="([\d.]+)/) || [])[1]; return w && h ? `0 0 ${w} ${h}` : "0 0 24 24"; })();
    const inner = m[2].replace(/\bid="([^"]+)"/g, `id="g${id}_$1"`).replace(/url\(#([^)]+)\)/g, `url(#g${id}_$1)`).replace(/href="#([^"]+)"/g, `href="#g${id}_$1"`);
    out += `<symbol id="g${id}" viewBox="${vb}" preserveAspectRatio="none">${inner}</symbol>`;
  }
  return out;
}

/* One screen as HTML; hotspots on top (bigger first, so buttons inside rows stay clickable). */
export function renderSnap(s, chrome) {
  const fonts = new Set();
  let html = "";
  for (const n of s.n) {
    if (n[0] === "c") { const ch = chrome[n[1]]; if (ch) html += renderNodes(ch.n, ch.c, ch.f, fonts); }
    else html += renderNodes([n], s.c, s.f, fonts);
  }
  const hs = (s.hot || []).map((h) => ({ x: h[0], y: h[1], w: h[2], h: h[3], kind: h[4], label: h[5], primary: !!h[6] })).sort((a, b) => b.w * b.h - a.w * a.h);
  hs.forEach((h, i) => { html += `<a class="hs" data-hot="${esc(h.kind)}" data-label="${esc(h.label)}" data-h="${i}" style="${pos(h.x, h.y, h.w, h.h)}"></a>`; });
  return {
    id: s.id, name: s.name, state: s.state, fonts: [...fonts],
    html: `<section class="screen snap" data-id="${esc(s.id)}" data-name="${esc(s.name)}" style="width:${s.w}px;height:${s.h}px;background:${s.bg && s.bg !== "IMG" ? s.bg : "#fff"}">${html}</section>`,
    hotspots: hs.map(({ kind, label, primary }) => ({ kind, label, primary })),
  };
}

export const SNAP_CSS = `.screen.snap{min-height:0;overflow:hidden}.snap .b,.snap .x,.snap .g{position:absolute;display:block;margin:0;box-sizing:border-box}.snap .x{display:flex;flex-direction:column;overflow:visible;line-height:normal}.snap .img{background:repeating-linear-gradient(45deg,#e6e9ee 0 8px,#f2f4f7 8px 16px)}.snap .g{overflow:visible}.snap .hs{position:absolute;z-index:3;cursor:pointer;border-radius:4px}.snap .hs.live:hover{background:rgba(61,139,253,.10)}body.hint .snap .hs.live,.flash .snap .hs.live,.snap.flash .hs.live{outline:2px solid #3d8bfd;background:rgba(61,139,253,.12)}`;

/* Merge saved snapshot parts (one per Figma batch or capture call) into screens in plan order. */
export function mergeSnaps(parts, plan) {
  const screens = {}, chrome = {}, svg = {};
  for (const p of parts) { if (!p) continue; (p.screens || []).forEach((s) => (screens[s.id] = s)); Object.assign(chrome, p.chrome || {}); Object.assign(svg, p.svg || {}); }
  const order = (plan || []).map((x) => x.id);
  const list = Object.values(screens).sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
  return { screens: list, chrome, svg };
}
export const knownOf = (parts) => {
  const s = new Set(), c = new Set();
  for (const p of parts || []) { Object.keys(p?.svg || {}).forEach((k) => s.add(k)); Object.keys(p?.chrome || {}).forEach((k) => c.add(k)); }
  return { s: [...s], c: [...c] };
};
