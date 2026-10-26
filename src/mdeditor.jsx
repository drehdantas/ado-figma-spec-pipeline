import React, { useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { Bold, Heading2, List, ListOrdered, Table2, ImagePlus, Eye, PenLine, Columns2, Loader2 } from "lucide-react";

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
td.use(gfm);
td.remove(["style", "script", "meta"]);

const IMG_RE = /!\[([^\]]*)\]\(((?:asset|img):[^)\s]+|https?:[^)\s]+)\)/g;

/* Resolve image refs: asset:<id> → served blob, img:<key> → data URI kept with the ADO. */
export function resolveSrc(src, images) {
  if (src.startsWith("asset:")) return "/_blob/" + src.slice(6);
  if (src.startsWith("img:")) return images?.[src.slice(4)] || "";
  return src;
}
export function imageRefs(md) {
  const out = [];
  let m;
  IMG_RE.lastIndex = 0;
  while ((m = IMG_RE.exec(md || ""))) out.push({ alt: m[1], src: m[2] });
  return out;
}
/* Text for prompts and keyword rules: images become numbered placeholders. */
export function mdForPrompt(md) {
  let n = 0;
  return String(md || "").replace(IMG_RE, (_, alt) => `[Image ${++n}${alt ? ": " + alt : ""}]`);
}
export async function imageBlobs(md, images, max) {
  const refs = imageRefs(md).filter((r) => !/^https?:/.test(r.src)).slice(0, max);
  const out = [];
  for (const r of refs) {
    try { const res = await fetch(resolveSrc(r.src, images)); if (res.ok) out.push(await res.blob()); } catch {}
  }
  return out;
}

async function downscale(file, maxSide = 1400, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const type = file.type === "image/png" && c.width * c.height < 900000 ? "image/png" : "image/jpeg";
    const blob = await new Promise((ok) => c.toBlob(ok, type, quality));
    return blob || file;
  } finally { URL.revokeObjectURL(url); }
}
const toDataUrl = (blob) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob); });

export function MarkdownEditor({ id, value, onChange, images, onImages, assets, notify, placeholder }) {
  const [mode, setMode] = useState("write");
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const ta = useRef(null);
  const latest = useRef(value);
  latest.current = value;

  const html = useMemo(() => {
    if (mode === "write") return "";
    const r = new marked.Renderer();
    r.image = (href, title, text) => {
      const src = resolveSrc(String(href || ""), images);
      return src ? `<img src="${src}" alt="${(text || "").replace(/"/g, "&quot;")}" loading="lazy">` : `<span class="md-missing">[missing image: ${text || href}]</span>`;
    };
    return DOMPurify.sanitize(marked.parse(value || "", { renderer: r, breaks: true, gfm: true }), { ADD_DATA_URI_TAGS: ["img"], ALLOWED_URI_REGEXP: /^(?:https?:|data:image\/|\/_blob\/|#)/i });
  }, [value, images, mode]);

  const insert = (text, selectInserted = false) => {
    const el = ta.current;
    const cur = latest.current || "";
    const start = el ? el.selectionStart : cur.length, end = el ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    onChange(next);
    requestAnimationFrame(() => { if (el) { el.focus(); const p = start + text.length; el.setSelectionRange(selectInserted ? start : p, p); } });
    return { start, text };
  };
  const wrap = (before, after = before, fallback = "text") => {
    const el = ta.current; const cur = latest.current || "";
    const s = el.selectionStart, e = el.selectionEnd; const sel = cur.slice(s, e) || fallback;
    onChange(cur.slice(0, s) + before + sel + after + cur.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const linePrefix = (prefix) => {
    const el = ta.current; const cur = latest.current || "";
    const s = cur.lastIndexOf("\n", el.selectionStart - 1) + 1; const e = el.selectionEnd;
    const block = cur.slice(s, e).split("\n").map((l, i) => (typeof prefix === "function" ? prefix(i) : prefix) + l).join("\n");
    onChange(cur.slice(0, s) + block + cur.slice(e));
    requestAnimationFrame(() => el.focus());
  };

  const addImages = async (files) => {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    setUploading((n) => n + list.length);
    let count = imageRefs(latest.current).length;
    for (const f of list) {
      const label = `Screenshot ${++count}`;
      const token = `![Uploading ${label}…](uploading)`;
      insert(`\n${token}\n`);
      let ref = null;
      try {
        const small = await downscale(f);
        if (assets) {
          try { const up = await assets.upload(small, { type: small.type }); ref = `asset:${up.id}`; }
          catch (e) { if (e?.code === "quota_exceeded" || e?.code === "too_large") notify?.("Image storage is full: kept this image with the ADO instead."); }
        }
        if (!ref) {
          const key = "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          const data = await toDataUrl(await downscale(f, 1100, 0.72));
          onImages?.((m) => ({ ...(m || {}), [key]: data }));
          ref = `img:${key}`;
        }
        onChange(latest.current.replace(token, `![${label}](${ref})`));
      } catch {
        onChange(latest.current.replace(token, ""));
        notify?.("Couldn't read that image. Try PNG or JPEG.");
      } finally { setUploading((n) => n - 1); }
    }
  };

  const onPaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [...(cd.files || [])].filter((f) => /^image\//.test(f.type));
    const htmlData = cd.getData("text/html");
    if (files.length && !htmlData) { e.preventDefault(); addImages(files); return; }
    if (htmlData && /<(table|ul|ol|li|h[1-6]|b|strong|em|img|br|p|div)[\s>]/i.test(htmlData)) {
      e.preventDefault();
      let md = td.turndown(htmlData).replace(/\n{3,}/g, "\n\n").trim();
      // images inside copied HTML that point to other sites (e.g. ADO attachments) can't be loaded here: keep them as links
      md = md.replace(/!\[([^\]]*)\]\((https?:[^)]+)\)/g, (_, alt, url) => `[Image${alt ? ": " + alt : ""} (open in ADO)](${url})`);
      insert(md);
      if (files.length) addImages(files);
    }
  };

  const tools = [
    [Bold, "Bold", () => wrap("**")],
    [Heading2, "Heading", () => linePrefix("## ")],
    [List, "Bulleted list", () => linePrefix("- ")],
    [ListOrdered, "Numbered list", () => linePrefix((i) => `${i + 1}. `)],
    [Table2, "Table", () => insert("\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n")],
  ];
  const nImages = imageRefs(value).length;
  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-md border bg-surface ${drag ? "border-accent ring-2 ring-accent/30" : "border-line"}`}
      onDragOver={(e) => { if ([...e.dataTransfer.items].some((i) => i.kind === "file")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDrag(false); addImages(e.dataTransfer.files); } }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-2 py-1.5">
        <div role="tablist" aria-label="Editor view" className="flex gap-0.5">
          {[["write", "Write", PenLine], ["split", "Split", Columns2], ["preview", "Preview", Eye]].map(([k, l, I]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === k ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted hover:text-fg"} ${k === "split" ? "hidden md:flex" : ""}`}><I size={13} aria-hidden="true" />{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {mode !== "preview" && tools.map(([I, l, fn]) => <button key={l} type="button" title={l} aria-label={l} onClick={fn} className="rounded p-1.5 text-muted hover:bg-surface hover:text-fg"><I size={15} /></button>)}
          <label className="ml-1 flex cursor-pointer items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-xs font-medium hover:bg-surface-2">
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}Add image
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="sr-only" onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      <div className={`grid min-h-0 ${mode === "split" ? "md:grid-cols-2" : ""}`}>
        {mode !== "preview" && (
          <textarea id={id} ref={ta} spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} onPaste={onPaste} placeholder={placeholder}
            className={`h-[28rem] w-full resize-y border-0 bg-surface p-3 font-mono text-[13px] leading-relaxed text-fg placeholder:text-muted focus:outline-none ${mode === "split" ? "md:border-r md:border-line" : ""}`} />
        )}
        {mode !== "write" && (
          <div className="md-preview h-[28rem] min-w-0 overflow-auto p-4 text-sm" dangerouslySetInnerHTML={{ __html: html || '<p class="md-empty">Nothing to preview yet.</p>' }} />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[11px] text-muted">
        <span>Markdown · paste text, tables or screenshots · drop images here</span>
        <span>{uploading ? `Adding ${uploading} image${uploading > 1 ? "s" : ""}…` : `${nImages} image${nImages === 1 ? "" : "s"}`}{!assets && nImages ? " · stored with this ADO" : ""}</span>
      </div>
    </div>
  );
}
