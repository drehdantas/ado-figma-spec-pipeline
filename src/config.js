/* Workspace configuration: PRD template, design-system slots, Figma sitemap, AI provider. */
import { PRD_SECTIONS, PRD_RAW, PRD_NAME, SAMPLE_DS_FILES, SAMPLE_JOURNEY, SAMPLE_NODE, MATRIX_STYLE_GUIDE } from "./sample/defaults.js";

export const RULES = {
  strict: { label: "Strict", text: "Use only this design system's tokens and components. Where the product's existing screens differ, follow the design system and log the difference in the Drift Matrix." },
  hybrid: { label: "Hybrid", text: "Use this design system's tokens. Where the product's source-of-truth file has an established precedent (breadcrumb placement, button hierarchy, table density), follow the precedent for consistency and log the deviation in the Drift Matrix." },
  reference: { label: "Reference only", text: "Treat these files as reference guidance. Prefer what the Figma file already does; flag conflicts in the Drift Matrix." },
};

export const sid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const NOW = () => new Date().toISOString();

export const DEFAULT_CONFIG = {
  version: 4,
  productName: "Your product",
  template: { name: PRD_NAME, updatedAt: NOW(), sections: PRD_SECTIONS, raw: PRD_RAW },
  slots: [{ id: "example", name: "Example Design System", rule: "hybrid", packages: [{ id: "p-example", name: "example-design-system (built in)", updatedAt: NOW(), files: SAMPLE_DS_FILES }] }],
  activeSlot: "example",
  styleGuide: MATRIX_STYLE_GUIDE,
  sotUrl: "",
  journey: { groups: SAMPLE_JOURNEY, source: "Sample sitemap. Sync it from your Figma file.", syncedAt: null },
  ai: { provider: "auto", openai: { baseUrl: "https://api.openai.com/v1", model: "" }, anthropic: { model: "" }, gemini: { model: "" } },
};
export const DEFAULT_NODE = SAMPLE_NODE;

/* Older saved configs: {packages:{hybrid,strict}, dsMode} → slots. Keeps every package the user had. */
export function migrateConfig(c) {
  if (!c) return DEFAULT_CONFIG;
  let out = { ...DEFAULT_CONFIG, ...c };
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
    out.slots = slots.length ? slots : DEFAULT_CONFIG.slots;
    out.activeSlot = c.dsMode && /strict/i.test(c.dsMode) ? "strict" : (out.slots[0] || {}).id;
    delete out.packages; delete out.dsMode;
  }
  if (!out.slots.some((s) => s.id === out.activeSlot)) out.activeSlot = out.slots[0]?.id;
  out.ai = { ...DEFAULT_CONFIG.ai, ...(c.ai || {}) };
  out.version = 4;
  return out;
}

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
