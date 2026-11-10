/* Reads a Figma file you may only VIEW. use_figma needs edit access even to read, so the source of truth
   is read with Figma's read-only get_metadata tool (layer names, types, sizes) and digested here into the
   same shape the page reader returns: real screens, screen anatomy, components in use, modals, handoff. */

const textOf = (res) => {
  if (typeof res === "string") return res;
  if (typeof res?.payload === "string") return res.payload;
  const c = res?.content || res?.payload?.content;
  if (Array.isArray(c)) return c.filter((x) => x.type === "text").map((x) => x.text).join("\n");
  return res?.text || (res?.payload ? JSON.stringify(res.payload) : "");
};

export async function metaPages(mcp, fileKey) {
  const t = textOf(await mcp.callTool("Figma", "get_metadata", { fileKey }, { cache: false }));
  const pages = [...t.matchAll(/^- (\d+:\d+): (.+)$/gm)].map((m) => ({ id: m[1], name: m[2].trim() }));
  if (!pages.length) throw new Error("Figma didn't return the page list of the source of truth.");
  return pages;
}

export async function metaNode(mcp, fileKey, nodeId) {
  const t = textOf(await mcp.callTool("Figma", "get_metadata", { fileKey, nodeId }, { cache: false }));
  const start = t.indexOf("<"); const end = t.lastIndexOf(">");
  if (start < 0 || end < start) throw new Error("Figma didn't return the layers of the source of truth.");
  return t.slice(start, end + 1);
}

const SKIP = /^_|^\d+px\/|^icon\b|\bicons?\s*\/|^[A-Z][A-Za-z]+\/[a-z0-9_]+$|browser|broswer|checkmark|scroller|^cursor|tooltip|divider/i;
const MOD = /modal|dialog|drawer|side ?panel|sheet|popover/i;
const num = (el, a) => Math.round(Number(el.getAttribute(a)) || 0);
const hidden = (el) => el.getAttribute("hidden") === "true";
const kids = (el) => [...el.children].filter((k) => !hidden(k));
const sym = { instance: "◆", text: "T", frame: "▢", section: "§" };

function tree(el, d, max, lines = [], pad = "") {
  if (lines.length >= max) return lines;
  const tag = el.tagName.toLowerCase();
  lines.push(`${pad}${sym[tag] || tag.toUpperCase()} ${el.getAttribute("name")} ${num(el, "width")}x${num(el, "height")}`);
  if (tag !== "instance" && d > 0) for (const k of kids(el).slice(0, 16)) tree(k, d - 1, max, lines, pad + "  ");
  return lines;
}

/* Digest one page (or node) of XML metadata. */
export function digestXml(xml, pageName) {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("The source-of-truth layers couldn't be read.");
  const root = doc.documentElement;
  const all = [...root.getElementsByTagName("*")].filter((e) => !hidden(e));
  const isTop = (e) => { const p = e.parentElement; return p === root || ["section", "canvas", "page"].includes(p?.tagName.toLowerCase()) || p?.parentElement === root && p.tagName.toLowerCase() === "canvas"; };
  const instCount = (e) => e.getElementsByTagName("instance").length;
  const screens = all.filter((e) => e.tagName.toLowerCase() === "frame" && isTop(e) && num(e, "width") >= 960 && num(e, "height") >= 560 && instCount(e) >= 3)
    .sort((a, b) => num(a, "y") - num(b, "y") || num(a, "x") - num(b, "x"));
  const best = [...screens].sort((a, b) => instCount(b) - instCount(a))[0];
  /* Components the product uses: top-level instances (not parts inside another instance). */
  const uses = {};
  for (const e of all) {
    if (e.tagName.toLowerCase() !== "instance") continue;
    let p = e.parentElement, inside = false;
    while (p && p !== root) { if (p.tagName.toLowerCase() === "instance") { inside = true; break; } p = p.parentElement; }
    if (inside) continue;
    const n = e.getAttribute("name");
    if (!n || SKIP.test(n) || (num(e, "width") <= 24 && num(e, "height") <= 24)) continue;
    uses[n] = (uses[n] || 0) + 1;
  }
  const seen = new Set(); const modals = [];
  for (const e of all) {
    const n = e.getAttribute("name") || "";
    if (!MOD.test(n) || num(e, "width") < 280 || num(e, "width") > 1100 || num(e, "height") < 120) continue;
    const k = n + "|" + num(e, "width"); if (seen.has(k)) continue; seen.add(k);
    modals.push({ name: n, w: num(e, "width"), h: num(e, "height"), anatomy: tree(e, 3, 24).join("\n") });
    if (modals.length >= 3) break;
  }
  const ho = all.find((e) => /^handoff$/i.test(e.getAttribute("name") || "") && e.tagName.toLowerCase() === "frame");
  const handoff = ho ? { cards: kids(ho).filter((c) => c.tagName.toLowerCase() === "frame").map((c) => {
    const tbl = [...c.getElementsByTagName("frame")].find((f) => /^table/i.test(f.getAttribute("name") || ""));
    const head = tbl && tbl.children[0] ? [...tbl.children[0].children].filter((x) => x.tagName.toLowerCase() === "text").map((x) => `${x.getAttribute("name")}:${num(x, "width")}`) : [];
    return { name: c.getAttribute("name"), head };
  }) } : null;
  return {
    page: pageName,
    viewOnly: true,
    exemplars: Object.fromEntries(Object.entries(uses).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([n, u]) => [n, { uses: u }])),
    styles: [], vars: [],
    screenNames: screens.slice(0, 40).map((s) => s.getAttribute("name")),
    screenAnatomy: best ? tree(best, 4, 80).join("\n") : null,
    modals, handoff,
  };
}

/* Read up to `ids` pages of a view-only file. */
export async function readViewOnly(mcp, fileKey, ids, pages, errs = []) {
  const out = [];
  for (const id of ids) {
    const name = pages.find((p) => p.id === id)?.name || id;
    try { const xml = await metaNode(mcp, fileKey, id); out.push(digestXml(xml, name)); }
    catch (e) { errs.push(`SSOT ${name}: ${e?.message || e}`); out.push(null); }
  }
  return out;
}

export const isAccessError = (e) => /edit access|permission|not allowed|forbidden|403|can't edit|cannot edit|view.?only/i.test(String(e?.message || e?.error || e || ""));
