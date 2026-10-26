/* Figma connector bridge: page sync, screen generation and the review board, via the Figma MCP `use_figma` tool. */

export function parseFigmaUrl(url) {
  const m = String(url || "").match(/figma\.com\/(?:design|file|board|slides|proto)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?/);
  if (!m) return null;
  return { fileKey: m[2] || m[1], mainKey: m[1], branch: !!m[2] };
}

const ERR = {
  server_not_connected: "The Figma connector isn't connected. Add it in claude.ai › Settings › Connectors (needs a Figma Professional plan or above and edit access to the file), then try again.",
  selection_required: "You have more than one Figma connector. Choose one in the prompt claude.ai shows, then try again.",
  needs_reauth: "Your Figma connection expired. Reconnect Figma in claude.ai › Settings › Connectors, then try again.",
  not_in_manifest: "Allow this page to use Figma when claude.ai asks, then try again.",
  approval_required: "Figma access needs your approval. Open the page in claude.ai and allow Figma when asked.",
  consent_required: "Allow this page to use Figma when claude.ai asks, then try again.",
  blocked_by_policy: "Your organization's policy blocks Figma for this page.",
  server_unavailable: "Figma didn't answer in time. The change may still have been made: check the file before trying again.",
  upstream_error: "Figma returned an error. Check the file before trying again.",
  rate_limited: "Too many Figma requests. Wait a minute and try again.",
  cancelled: "Stopped.",
};
export const figmaErrorText = (e) => {
  if (e?.code === "tool_error") {
    const r = e.result;
    const t = r?.content?.find?.((c) => c.type === "text")?.text || e.message || "";
    return "Figma reported an error: " + String(t).slice(0, 400);
  }
  return ERR[e?.code] || `Figma call failed (${e?.code || e?.message || "unknown"}).`;
};

let schemaCache;
async function useFigmaInput(mcp, fileKey, code, description) {
  if (schemaCache === undefined) {
    try { schemaCache = (await mcp.describeTool("Figma", "use_figma"))?.inputSchema || null; } catch { schemaCache = null; }
  }
  const props = schemaCache?.properties || null;
  if (!props) return { fileKey, code, description, skillNames: "figma-use" };
  const input = {};
  let codeKey = null;
  for (const k of Object.keys(props)) {
    if (/file.?key/i.test(k)) input[k] = fileKey;
    else if (/^(code|script|js|javascript|source)$/i.test(k)) { input[k] = code; codeKey = k; }
    else if (/skill/i.test(k)) input[k] = props[k]?.type === "array" ? ["figma-use"] : "figma-use";
    else if (/desc|intent|summary|purpose/i.test(k)) input[k] = description;
  }
  if (!codeKey) input.code = code;
  return input;
}

export async function runInFigma(mcp, fileKey, code, description) {
  const input = await useFigmaInput(mcp, fileKey, code, description);
  const res = await mcp.callTool("Figma", "use_figma", input, { cache: false });
  let out = res.payload;
  if (typeof out === "string") { try { out = JSON.parse(out); } catch {} }
  return out;
}

/* ---------- Page sync ---------- */
export const PAGES_CODE = `return figma.root.children.map((p) => ({ id: p.id, name: p.name }));`;

export function pagesToGroups(pages) {
  const groups = [];
  let cur = { group: "Pages", nodes: [] };
  for (const p of pages) {
    const raw = String(p.name || p).trim();
    if (!raw) continue;
    const sep = raw.match(/^-{2,}\s*(.+?)\s*-{2,}$/);
    if (sep) { if (cur.nodes.length) groups.push(cur); cur = { group: sep[1], nodes: [] }; continue; }
    const sub = /^[↳└>]/.test(raw);
    const name = raw.replace(/^[↳└>\s]+/, "");
    cur.nodes.push({ id: name.split(/\s+/)[0], name, pageName: raw, sub });
  }
  if (cur.nodes.length) groups.push(cur);
  return groups;
}
export function extractPages(payload) {
  const arr = Array.isArray(payload) ? payload : Array.isArray(payload?.pages) ? payload.pages : Array.isArray(payload?.result) ? payload.result : null;
  if (!arr) throw new Error("Figma answered, but not with a page list.");
  return arr;
}

export function stripFences(code) {
  return String(code).replace(/^\s*```(?:js|javascript)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

export function screenList(res) {
  const map = new Map();
  for (const v of res.validation) {
    if (v.status !== "Designed") continue;
    for (const id of v.node.match(/[A-Z]\d+(?:\.\d+)+/g) || []) map.set(id, [...(map.get(id) || []), v.ac + " " + v.requirement]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([id, acs]) => ({ id, acs: acs.join("; ") }));
}
