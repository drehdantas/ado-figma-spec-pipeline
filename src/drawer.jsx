import React, { useEffect, useState } from "react";
import { FileText, Package, Figma, ChevronDown, ChevronRight, Upload, Eye, RefreshCw, ClipboardPaste, Trash2, Download, Layers, Settings2, Plus, Loader2, AlertTriangle, Cpu, KeyRound, Pencil } from "lucide-react";
import { Badge, Btn, Modal, Field, inputCls, fmtDate } from "./ui.jsx";
import { parseTemplateText, docxToText, zipToFiles } from "./engine.js";
import { parseFigmaUrl, runInFigma, figmaErrorText, PAGES_CODE, pagesToGroups, extractPages } from "./figma.js";
import { RULES, activeDS, sid } from "./config.js";
import { PROVIDERS, getKey, setKey, resolveProvider } from "./ai.js";

export async function saveFile(downloads, filename, data, notify, fallback) {
  if (downloads) {
    try { await downloads.save({ filename, data }); notify(`Saved ${filename}`); return; }
    catch (e) { if (e?.code === "declined") { notify("Download cancelled"); return; } if (e?.code === "rate_limited") { notify("Another download is waiting for your answer"); return; } }
  }
  // Standalone (self-hosted) pages can download directly.
  if (window.top === window && !window.claude) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    notify(`Saved ${filename}`); return;
  }
  if (fallback && typeof data === "string") fallback({ filename, data });
  else notify("Saving files isn't available in this view.");
}

const kindOf = (p) => (/token/i.test(p) ? "tokens" : /button/i.test(p) ? "buttons" : /modal|dialog/i.test(p) ? "modals" : /panel/i.test(p) ? "panels" : /card/i.test(p) ? "cards" : /table/i.test(p) ? "tables" : /utilit|layout/i.test(p) ? "layout" : /\.json$/i.test(p) ? "tokens json" : /design\.md$/i.test(p) ? "rules / index" : "component");

function SlotsCard({ cfg, setCfg, notify, downloads, guard }) {
  const [upload, setUpload] = useState(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(null);
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState(cfg.activeSlot);
  const ds = activeDS(cfg);
  const setSlot = (id, patch) => setCfg({ ...cfg, slots: cfg.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const dlSlot = async (slot) => {
    const zip = new window.JSZip();
    for (const p of slot.packages) p.files.forEach((f) => zip.file(slot.packages.length > 1 ? `${p.name.replace(/\.zip$/i, "")}/${f.path}` : f.path, f.content));
    await saveFile(downloads, `${slot.name.replace(/[^\w-]+/g, "-").toLowerCase()}.zip`, await zip.generateAsync({ type: "uint8array" }), notify);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Package size={12} />Design system slots</p>
        <Btn size="sm" icon={Plus} onClick={() => setAdding(true)}>Add slot</Btn>
      </div>
      <div role="radiogroup" aria-label="Design system in use" className="flex flex-col gap-2">
        {cfg.slots.map((slot) => {
          const on = cfg.activeSlot === slot.id;
          const nFiles = slot.packages.reduce((a, p) => a + p.files.length, 0);
          return (
            <div key={slot.id} className={`rounded-md border bg-surface p-2.5 ${on ? "border-accent" : "border-line"}`}>
              <div className="flex items-start gap-2">
                <button role="radio" aria-checked={on} aria-label={`Use ${slot.name}`} onClick={() => guard("Switching the design system", () => setCfg({ ...cfg, activeSlot: slot.id }))} className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-accent" : "border-line"}`}>{on && <span className="h-2 w-2 rounded-full bg-accent" />}</button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === slot.id ? null : slot.id)} aria-expanded={open === slot.id}>
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{slot.name}<Badge tone="neutral">{RULES[slot.rule]?.label || slot.rule}</Badge>{on && <Badge tone="accent">In use</Badge>}</span>
                  <span className="block truncate text-xs text-muted">{slot.packages.length ? `${slot.packages.length} package${slot.packages.length > 1 ? "s" : ""} · ${nFiles} files` : "No package uploaded yet"}</span>
                </button>
                {open === slot.id ? <ChevronDown size={15} className="mt-1 text-muted" /> : <ChevronRight size={15} className="mt-1 text-muted" />}
              </div>
              {open === slot.id && (
                <div className="mt-2 flex flex-col gap-2 pl-6">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input aria-label="Slot name" className={inputCls} value={slot.name} onChange={(e) => setSlot(slot.id, { name: e.target.value })} />
                    <select aria-label="How strictly to apply it" className={inputCls} value={slot.rule} onChange={(e) => setSlot(slot.id, { rule: e.target.value })}>{Object.entries(RULES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select>
                  </div>
                  <p className="text-[11px] text-muted">{RULES[slot.rule]?.text}</p>
                  {slot.packages.length > 0 && (
                    <ul className="flex flex-col divide-y divide-line rounded border border-line text-xs">
                      {slot.packages.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="text-[11px] text-muted">{p.files.length} files · {fmtDate(p.updatedAt)}</span></span>
                          <Btn size="sm" variant="ghost" icon={Trash2} aria-label={`Remove ${p.name}`} onClick={() => setDel({ kind: "pkg", slot, pkg: p })} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Btn size="sm" icon={Upload} onClick={() => setUpload(slot)}>Upload package</Btn>
                    <Btn size="sm" icon={Download} disabled={!slot.packages.length} onClick={() => dlSlot(slot)}>Download .zip</Btn>
                    <Btn size="sm" variant="danger" icon={Trash2} disabled={cfg.slots.length < 2} onClick={() => setDel({ kind: "slot", slot })}>Delete slot</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {ds.fallback && <p role="status" className="flex gap-1.5 rounded-md bg-warn-bg px-2 py-1.5 text-xs text-warn-fg"><AlertTriangle size={14} className="mt-px shrink-0" />“{ds.name}” has no package yet. Analysis and prompts use the files of “{ds.fallback}”, with this slot's rule, until you upload one.</p>}
      <details className="text-xs"><summary className="cursor-pointer text-muted hover:text-fg">Files in use ({ds.files.length})</summary>
        <ul className="mt-1 flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
          {ds.files.map((f, i) => <li key={f.path + i} className="flex items-center justify-between gap-2 px-2 py-1"><button className="min-w-0 truncate text-left font-mono text-[11px] hover:text-accent hover:underline" onClick={() => setPreview(f)}>{f.path}</button><span className="shrink-0 text-[11px] text-muted">{kindOf(f.path)}</span></li>)}
        </ul>
      </details>
      {preview && <Modal wide title={preview.path} onClose={() => setPreview(null)}><pre className="whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed">{preview.content}</pre></Modal>}
      {upload && <UploadDialog slot={upload} onClose={() => setUpload(null)} onFiles={(files, name) => { setSlot(upload.id, { packages: [...upload.packages, { id: sid(), name, updatedAt: new Date().toISOString(), files }] }); notify(`${name} added to ${upload.name}`); setUpload(null); }} />}
      {adding && <AddSlot onClose={() => setAdding(false)} onAdd={(name, rule) => { const id = sid(); setCfg({ ...cfg, slots: [...cfg.slots, { id, name, rule, packages: [] }] }); setOpen(id); setAdding(false); notify(`Slot “${name}” added`); }} />}
      {del && (
        <Modal title={del.kind === "slot" ? `Delete “${del.slot.name}”?` : `Remove ${del.pkg.name}?`} onClose={() => setDel(null)}
          footer={<><Btn onClick={() => setDel(null)}>Cancel</Btn><Btn variant="danger" icon={Trash2} onClick={() => guard(del.kind === "slot" ? "Deleting a design system slot" : "Removing a package", () => {
            if (del.kind === "slot") { const slots = cfg.slots.filter((s) => s.id !== del.slot.id); setCfg({ ...cfg, slots, activeSlot: cfg.activeSlot === del.slot.id ? slots[0].id : cfg.activeSlot }); }
            else setSlot(del.slot.id, { packages: del.slot.packages.filter((p) => p.id !== del.pkg.id) });
            setDel(null);
          })}>{del.kind === "slot" ? "Delete slot" : "Remove package"}</Btn></>}>
          <p className="text-sm">{del.kind === "slot" ? `The slot and its ${del.slot.packages.length} package(s) are removed from this workspace. Download it first if you may need it again.` : "The package's files are removed from this slot."}</p>
        </Modal>
      )}
    </div>
  );
}

function AddSlot({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [rule, setRule] = useState("strict");
  return (
    <Modal title="Add a design system slot" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!name.trim()} onClick={() => onAdd(name.trim(), rule)}>Add slot</Btn></>}>
      <div className="flex flex-col gap-3">
        <Field label="Name"><input id="slotName" autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brand DS 100% strict" /></Field>
        <Field label="How strictly to apply it" hint={RULES[rule].text}><select id="slotRule" className={inputCls} value={rule} onChange={(e) => setRule(e.target.value)}>{Object.entries(RULES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
        <p className="text-xs text-muted">Upload one or more packages (.zip of Markdown/JSON, or single .md files) to the slot after adding it.</p>
      </div>
    </Modal>
  );
}

function UploadDialog({ slot, onClose, onFiles }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const onFile = async (f) => {
    setErr("");
    try {
      const buf = await f.arrayBuffer();
      const files = /\.zip$/i.test(f.name) ? await zipToFiles(buf) : [{ path: f.name, content: new TextDecoder().decode(buf) }];
      if (!files.length) { setErr("No .md or .json files found in that package."); return; }
      onFiles(files, f.name);
    } catch (e) { setErr("Couldn't read that file: " + (e.message || e)); }
  };
  return (
    <Modal title={`Upload a package to “${slot.name}”`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!text.trim()} onClick={() => onFiles([{ path: "DESIGN.md", content: text }], "Pasted rules")}>Use pasted text</Btn></>}>
      <div className="flex flex-col gap-3">
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${drag ? "border-accent bg-accent-soft" : "border-line bg-bg"}`}>
          <Upload size={20} aria-hidden="true" className="text-muted" />
          <span className="text-sm font-medium">Drop a file or click to choose</span>
          <span className="text-xs text-muted">.zip with Markdown / JSON files (tokens, components, rules), or a single .md / .json. Packages add up: existing ones stay.</span>
          <input type="file" className="sr-only" accept=".zip,.md,.json,.txt" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </label>
        <Field label="…or paste design rules (Markdown)"><textarea id="pkgText" className="h-40 w-full rounded-md border border-line bg-surface p-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        {err && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">{err}</p>}
      </div>
    </Modal>
  );
}

function AICard({ cfg, setCfg, caps }) {
  const ai = cfg.ai;
  const [keys, setKeys] = useState(() => ({ openai: getKey("openai"), anthropic: getKey("anthropic"), gemini: getKey("gemini") }));
  const resolved = resolveProvider(ai, caps);
  const setAI = (patch) => setCfg({ ...cfg, ai: { ...ai, ...patch } });
  const p = ai.provider;
  const keyField = (prov) => (
    <Field label={`${PROVIDERS[prov].label} key`} icon={KeyRound} hint="Kept in this browser only. Never saved with the workspace or shared.">
      <input type="password" autoComplete="off" id={`key-${prov}`} className={inputCls} value={keys[prov]} onChange={(e) => { setKeys({ ...keys, [prov]: e.target.value }); setKey(prov, e.target.value); }} placeholder={prov === "openai" ? "Optional for local servers" : "Paste your API key"} />
    </Field>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Cpu size={12} />Workspace & AI provider</p>
      <Field label="Product / platform name" hint="Used in every prompt, e.g. “Admin Console 2026”."><input id="productName" className={inputCls} value={cfg.productName} onChange={(e) => setCfg({ ...cfg, productName: e.target.value })} /></Field>
      <Field label="AI agent for analysis, suggestions and design">
        <select id="aiProvider" className={inputCls} value={p} onChange={(e) => setAI({ provider: e.target.value })}>
          <option value="auto">Automatic (best available)</option>
          {Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k} disabled={k === "claude" && !caps.sample}>{v.label}{k === "claude" && !caps.sample ? " · not available here" : ""}</option>)}
        </select>
      </Field>
      <p className="text-xs text-muted-strong">Using: <span className="font-semibold">{PROVIDERS[resolved]?.label}</span>. {PROVIDERS[resolved]?.note}</p>
      {p === "openai" && (<>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Base URL"><input id="oaiBase" className={inputCls} value={ai.openai.baseUrl} onChange={(e) => setAI({ openai: { ...ai.openai, baseUrl: e.target.value } })} /></Field>
          <Field label="Model"><input id="oaiModel" className={inputCls} value={ai.openai.model} onChange={(e) => setAI({ openai: { ...ai.openai, model: e.target.value } })} placeholder="model name" /></Field>
        </div>
        {keyField("openai")}
      </>)}
      {p === "anthropic" && (<><Field label="Model"><input id="antModel" className={inputCls} value={ai.anthropic.model} onChange={(e) => setAI({ anthropic: { ...ai.anthropic, model: e.target.value } })} placeholder="claude-sonnet-5-5" /></Field>{keyField("anthropic")}</>)}
      {p === "gemini" && (<><Field label="Model"><input id="gemModel" className={inputCls} value={ai.gemini.model} onChange={(e) => setAI({ gemini: { ...ai.gemini, model: e.target.value } })} placeholder="model name" /></Field>{keyField("gemini")}</>)}
      {["openai", "anthropic", "gemini"].includes(p) && window.claude && <p className="flex gap-1.5 rounded-md bg-warn-bg px-2 py-1.5 text-xs text-warn-fg"><AlertTriangle size={14} className="mt-px shrink-0" />Inside a Claude artifact the browser blocks calls to other AI services. Self-host the app (see the GitHub README) to use this provider.</p>}
    </div>
  );
}

export function ContextDrawer({ cfg, setCfg, pipe, setPipe, notify, open, setOpen, caps, guard }) {
  const [preview, setPreview] = useState(null);
  const [replaceTpl, setReplaceTpl] = useState(false);
  const [sync, setSync] = useState({ busy: null, err: "" });
  const [paste, setPaste] = useState(false);
  const { mcp, downloads } = caps;
  const runSync = async (which) => {
    const url = which === "target" ? pipe.figmaUrl : cfg.sotUrl;
    const parsed = parseFigmaUrl(url);
    if (!parsed) { setSync({ busy: null, err: `The ${which === "target" ? "target file / branch" : "source of truth"} field doesn't hold a Figma file link.` }); return; }
    if (!mcp) { setSync({ busy: null, err: "This view can't reach a Figma connector. Open the app as a Claude artifact with Figma connected, or paste the page list." }); return; }
    setSync({ busy: which, err: "" });
    try {
      const pages = extractPages(await runInFigma(mcp, parsed.fileKey, PAGES_CODE, "Read the list of page names to build the journey sitemap."));
      const groups = pagesToGroups(pages.filter((p) => /^(↳\s*)?[A-Z]\d|^-{2,}/.test(p.name)));
      setCfg({ ...cfg, journey: { groups, source: `Synced from ${which === "target" ? "target file" : "source of truth"} · ${pages.length} pages`, syncedAt: new Date().toISOString() } });
      setSync({ busy: null, err: "" });
      notify(`Journey nodes synced · ${pages.length} pages`);
    } catch (e) { setSync({ busy: null, err: e?.code ? figmaErrorText(e) : String(e.message || e) }); }
  };
  const ds = activeDS(cfg);
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-7xl px-gutter">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold"><Settings2 size={16} aria-hidden="true" />Configuration & context</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <span className="hidden truncate sm:inline">{cfg.productName} · {cfg.template.sections.length} PRD sections · {ds.name} · {pipe.journeyNode.split(" ")[0]} · AI: {PROVIDERS[resolveProvider(cfg.ai, caps)]?.label}</span>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </button>
        {open && (
          <div className="grid gap-4 pb-4 lg:grid-cols-2">
            <AICard cfg={cfg} setCfg={setCfg} caps={caps} />
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><FileText size={12} />PRD template</p>
                  <p className="mt-1 truncate text-sm font-semibold" title={cfg.template.name}>{cfg.template.name}</p>
                  <p className="text-xs text-muted">Last updated {fmtDate(cfg.template.updatedAt)} · {cfg.template.sections.length} sections</p>
                </div>
                <Badge tone="ok">Active</Badge>
              </div>
              <div className="flex flex-wrap gap-1">{[...new Set(cfg.template.sections.map((s) => s.group))].map((g) => <span key={g} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{g}</span>)}</div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Btn size="sm" icon={Eye} onClick={() => setPreview("template")}>Preview</Btn>
                <Btn size="sm" icon={RefreshCw} onClick={() => setReplaceTpl(true)}>Update / Replace PRD Template</Btn>
              </div>
            </div>
            <SlotsCard cfg={cfg} setCfg={setCfg} notify={notify} downloads={downloads} guard={guard} />
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-bg p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Figma size={12} />Figma target & source of truth</p>
              <Field label="Target Figma file / branch URL" hint={pipe.figmaUrl && !parseFigmaUrl(pipe.figmaUrl) ? "Not a Figma file link yet" : pipe.figmaUrl ? `File key ${parseFigmaUrl(pipe.figmaUrl).fileKey}${parseFigmaUrl(pipe.figmaUrl).branch ? " (branch)" : ""}` : "Where this ADO's screens will be built"}>
                <input id="figmaUrl" className={inputCls} value={pipe.figmaUrl} onChange={(e) => { const v = e.target.value; guard("Changing the target Figma file", () => setPipe({ figmaUrl: v })); }} placeholder="https://www.figma.com/design/…" />
              </Field>
              <Field label="Single source of truth (SOT) URL"><input id="sotUrl" className={inputCls} value={cfg.sotUrl} onChange={(e) => setCfg({ ...cfg, sotUrl: e.target.value })} placeholder="https://www.figma.com/design/… (your product's SOT file)" /></Field>
              <div className="rounded-md border border-line bg-surface p-2.5">
                <p className="text-xs font-semibold">Sync journey sitemap nodes</p>
                <p className="text-xs text-muted">Reads the page list of a file and turns it into the node options below.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Btn size="sm" icon={sync.busy === "target" ? Loader2 : RefreshCw} disabled={!!sync.busy || !parseFigmaUrl(pipe.figmaUrl)} onClick={() => runSync("target")}>From target file</Btn>
                  <Btn size="sm" icon={sync.busy === "sot" ? Loader2 : RefreshCw} disabled={!!sync.busy || !parseFigmaUrl(cfg.sotUrl)} onClick={() => runSync("sot")}>From SOT</Btn>
                  <Btn size="sm" variant="ghost" icon={ClipboardPaste} onClick={() => setPaste(true)}>Paste page list</Btn>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">{cfg.journey.source}{cfg.journey.syncedAt ? ` · ${fmtDate(cfg.journey.syncedAt)}` : ""}</p>
                {sync.err && <p role="alert" className="mt-1.5 rounded bg-bad-bg px-2 py-1 text-xs text-bad-fg">{sync.err}</p>}
              </div>
              <JourneyPicker groups={cfg.journey.groups} value={pipe.journeyNode} onChange={(v) => guard("Changing the journey node", () => setPipe({ journeyNode: v }))} />
              <div><Btn size="sm" icon={Eye} onClick={() => setPreview("style")}>Matrix style guide</Btn></div>
            </div>
          </div>
        )}
      </div>
      {preview === "template" && (
        <Modal wide title={`PRD template · ${cfg.template.name}`} onClose={() => setPreview(null)}>
          <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
            <ol className="flex flex-col gap-1 text-sm">{cfg.template.sections.map((s) => <li key={s.id} className="flex gap-2"><span className="w-8 shrink-0 font-mono text-xs text-muted">{s.id}</span><span>{s.title}</span></li>)}</ol>
            <pre className="min-w-0 whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed">{cfg.template.raw}</pre>
          </div>
        </Modal>
      )}
      {preview === "style" && (
        <Modal title="Matrix style guide" onClose={() => setPreview(null)} footer={<Btn variant="primary" onClick={() => setPreview(null)}>Done</Btn>}>
          <textarea id="styleGuide" className="h-80 w-full rounded-md border border-line bg-surface p-3 font-mono text-xs" value={cfg.styleGuide} onChange={(e) => setCfg({ ...cfg, styleGuide: e.target.value })} />
        </Modal>
      )}
      {paste && <PastePages onClose={() => setPaste(false)} onApply={(names) => { setCfg({ ...cfg, journey: { groups: pagesToGroups(names), source: `Pasted page list · ${names.length} pages`, syncedAt: new Date().toISOString() } }); setPaste(false); notify("Journey nodes updated"); }} />}
      {replaceTpl && <TemplateDialog cfg={cfg} setCfg={setCfg} notify={notify} onClose={() => setReplaceTpl(false)} />}
    </section>
  );
}

function PastePages({ onClose, onApply }) {
  const [t, setT] = useState("");
  const names = t.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <Modal title="Paste the Figma page list" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!names.length} onClick={() => onApply(names)}>Use {names.length || ""} pages</Btn></>}>
      <p className="mb-2 text-sm text-muted">One page name per line, as in the Figma Pages panel. Lines like “-- Reference --” start a group; a leading ↳ marks a nested page.</p>
      <textarea id="pastePages" className="h-72 w-full rounded-md border border-line bg-surface p-2 font-mono text-xs" value={t} onChange={(e) => setT(e.target.value)} placeholder={"-- Ready to build --\nJ0 - Get started\nJ1 - Set up campaigns\n↳ J1.2.1 - Campaign setup - Store Locator\n-- Reference --\nR1 - Reference & components"} />
    </Modal>
  );
}

export function JourneyPicker({ groups, value, onChange }) {
  const names = groups.flatMap((g) => g.nodes.map((n) => n.name));
  const known = names.includes(value);
  const [custom, setCustom] = useState(!known);
  useEffect(() => { if (names.includes(value)) setCustom(false); }, [groups]);
  const id = value.split(" ")[0];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="journeyNode" className="text-[11px] font-semibold uppercase tracking-wider text-muted">Journey sitemap node</label>
      <select id="journeyNode" className={inputCls} value={custom ? "__custom" : value} onChange={(e) => { if (e.target.value === "__custom") setCustom(true); else { setCustom(false); onChange(e.target.value); } }}>
        {groups.map((g) => <optgroup key={g.group} label={`-- ${g.group} --`}>{g.nodes.map((n) => <option key={n.pageName || n.name} value={n.name}>{n.sub ? "↳ " : ""}{n.name}</option>)}</optgroup>)}
        <optgroup label="-- New --"><option value="__custom">Custom node…</option></optgroup>
      </select>
      {custom && <input id="journeyNodeCustom" className={inputCls} value={known ? "" : value} onChange={(e) => onChange(e.target.value)} placeholder="J1.2.2 - Campaign setup - Coupons" />}
      <span className="flex items-center gap-1 text-xs text-muted"><Layers size={12} aria-hidden="true" /><span className="font-mono">{id.split(".").map((_, i, a) => a.slice(0, i + 1).join(".")).join(" › ")}</span></span>
    </div>
  );
}

function TemplateDialog({ cfg, setCfg, notify, onClose }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const apply = (raw, name) => {
    const sections = parseTemplateText(raw);
    if (sections.length < 3) { setErr("Found fewer than 3 numbered sections (like “2.1 Product Overview”). Check the file and try again."); return; }
    setCfg({ ...cfg, template: { name, updatedAt: new Date().toISOString(), sections, raw } });
    notify(`Template replaced · ${sections.length} sections`); onClose();
  };
  const onFile = async (f) => {
    setErr("");
    try { const buf = await f.arrayBuffer(); apply(/\.docx$/i.test(f.name) ? await docxToText(buf) : new TextDecoder().decode(buf), f.name); }
    catch (e) { setErr("Couldn't read that file: " + (e.message || e)); }
  };
  return (
    <Modal title="Update / Replace PRD Template" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!text.trim()} onClick={() => apply(text, "Pasted template")}>Use pasted text</Btn></>}>
      <div className="flex flex-col gap-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line bg-bg p-6 text-center">
          <Upload size={20} aria-hidden="true" className="text-muted" />
          <span className="text-sm font-medium">Choose a .docx, .md or .txt template</span>
          <span className="text-xs text-muted">Sections are detected from numbered headings (2.1, 3.4 …).</span>
          <input type="file" className="sr-only" accept=".docx,.md,.txt,.markdown" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </label>
        <Field label="…or paste the template text"><textarea id="tplText" className="h-40 w-full rounded-md border border-line bg-surface p-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        {err && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">{err}</p>}
      </div>
    </Modal>
  );
}
