/* Workspace configuration: PRD template, design-system slots, Figma sitemap, AI provider. */
import { PRD_SECTIONS, PRD_RAW, PRD_NAME, SAMPLE_DS_FILES, SAMPLE_JOURNEY, SAMPLE_NODE, MATRIX_STYLE_GUIDE } from "./sample/defaults.js";

export const RULES = {
  strict: { label: "Strict", text: "Use only this design system's tokens and components. Where the product's existing screens differ, follow the design system and log the difference in the Drift Matrix." },
  hybrid: { label: "Hybrid", text: "Use this design system's tokens. Where the product's source-of-truth file has an established precedent (breadcrumb placement, button hierarchy, table density), follow the precedent for consistency and log the deviation in the Drift Matrix." },
  reference: { label: "Reference only", text: "Treat these files as reference guidance. Prefer what the Figma file already does; flag conflicts in the Drift Matrix." },
};

export const sid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const NOW = () => new Date().toISOString();

/* Shared by every pipeline of the same product (same product / platform name). */
export const DEFAULT_PROFILE = {
  template: { name: PRD_NAME, updatedAt: NOW(), sections: PRD_SECTIONS, raw: PRD_RAW },
  slots: [{ id: "example", name: "Example Design System", rule: "hybrid", packages: [{ id: "p-example", name: "example-design-system (built in)", updatedAt: NOW(), files: SAMPLE_DS_FILES }] }],
  activeSlot: "example",
  styleGuide: MATRIX_STYLE_GUIDE,
};
export const PROFILE_KEYS = ["template", "slots", "activeSlot", "styleGuide"];
/* Own to each pipeline: product name, Figma source of truth and journey sitemap (target file and node already live on the pipeline). */
export const DEFAULT_JOURNEY = { groups: SAMPLE_JOURNEY, source: "Sample sitemap. Sync it from your Figma file.", syncedAt: null };

/* Workspace: products by name, AI provider. */
export const DEFAULT_CONFIG = {
  version: 5,
  products: {},
  legacy: null,
  ai: { provider: "auto", openai: { baseUrl: "https://api.openai.com/v1", model: "" }, anthropic: { model: "" }, gemini: { model: "" } },
};
export const DEFAULT_NODE = SAMPLE_NODE;

export const productKey = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
const pickProfile = (o) => Object.fromEntries(PROFILE_KEYS.map((k) => [k, o[k] ?? DEFAULT_PROFILE[k]]));
export const cloneProfile = (o) => JSON.parse(JSON.stringify(pickProfile(o || DEFAULT_PROFILE)));

/* Older design-system shape {packages:{hybrid,strict}, dsMode} → slots. Keeps every package the user had. */
function migrateSlots(c) {
  const out = { ...c };
  if (!Array.isArray(c.slots)) {
    const slots = [];
    if (c.packages) {
      const names = { hybrid: "Hybrid design system", strict: "Strict design system" };
      for (const k of ["hybrid", "strict"]) {
        if (!(k in c.packages)) continue;
        const p = c.packages[k];
        slots.push({ id: k, name: names[k], rule: k, packages: p ? [{ id: "p-" + k, name: p.name, updatedAt: p.updatedAt, files: p.files }] : [] });
      }
    }
    out.slots = slots.length ? slots : DEFAULT_PROFILE.slots;
    out.activeSlot = c.dsMode && /strict/i.test(c.dsMode) ? "strict" : (out.slots[0] || {}).id;
  }
  if (!out.slots.some((s) => s.id === out.activeSlot)) out.activeSlot = out.slots[0]?.id;
  return out;
}

/* v4 and older kept one global configuration. It becomes the product profile of its product name, and its
   source of truth and sitemap become the starting values of the pipelines that existed then. */
export function migrateConfig(c) {
  if (!c) return DEFAULT_CONFIG;
  const ai = { ...DEFAULT_CONFIG.ai, ...(c.ai || {}) };
  if (c.version >= 5 && c.products) {
    const products = Object.fromEntries(Object.entries(c.products).map(([k, p]) => [k, { ...p, ...migrateSlots(pickProfile(p)) }]));
    return { ...DEFAULT_CONFIG, ...c, products, ai };
  }
  const old = migrateSlots({ ...DEFAULT_PROFILE, ...c });
  const name = String(c.productName || "").trim();
  const products = name ? { [productKey(name)]: { name, ...pickProfile(old), updatedAt: NOW() } } : {};
  return { version: 5, products, ai, legacy: { productName: name, sotUrl: c.sotUrl || "", journey: c.journey || DEFAULT_JOURNEY, profile: name ? null : pickProfile(old) } };
}

/* A pipeline's own context, falling back to the old global values for pipelines made before v5. */
export function pipeContext(pipe, cfg) {
  const lg = (pipe?.ctxV ? null : cfg.legacy) || {};
  return { productName: pipe?.productName ?? lg.productName ?? "", sotUrl: pipe?.sotUrl ?? lg.sotUrl ?? "", journey: pipe?.journey || lg.journey || DEFAULT_JOURNEY };
}
export function profileOf(cfg, pipe) {
  const k = productKey(pipeContext(pipe, cfg).productName);
  if (k) return cfg.products?.[k] || null;
  return pipe?.ownProfile || (!pipe?.ctxV && cfg.legacy?.profile) || null;
}
/* The configuration a pipeline works with: its product's profile, its own Figma context, the workspace AI. */
export function scopedConfig(cfg, pipe) {
  const pc = pipeContext(pipe, cfg);
  return { ...cloneless(profileOf(cfg, pipe) || DEFAULT_PROFILE), ai: cfg.ai, productName: pc.productName.trim() || "Untitled product", productNameRaw: pc.productName, productKey: productKey(pc.productName), sotUrl: pc.sotUrl, journey: pc.journey };
}
const cloneless = (p) => pickProfile(p);
export const productNames = (cfg) => Object.values(cfg.products || {}).map((p) => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b));

/* The design system in use: the active slot, falling back to the first slot that has files. */
export function activeDS(cfg) {
  const slot = cfg.slots.find((s) => s.id === cfg.activeSlot) || cfg.slots[0];
  const files = (slot?.packages || []).flatMap((p) => (slot.packages.length > 1 ? p.files.map((f) => ({ ...f, path: `${p.name.replace(/\.zip$/i, "")}/${f.path}` })) : p.files));
  if (files.length) return { slot, files, fallback: null, rule: slot.rule, name: slot.name };
  const alt = cfg.slots.find((s) => s.packages?.length);
  return { slot, files: alt ? alt.packages.flatMap((p) => p.files) : [], fallback: alt?.name || null, rule: slot?.rule || "hybrid", name: slot?.name || "Design system" };
}
export const dsLabel = (cfg) => { const d = activeDS(cfg); return `${d.name} (${RULES[d.rule]?.label || d.rule})`; };
export const allNodes = (cfg) => cfg.journey.groups.flatMap((g) => g.nodes);
