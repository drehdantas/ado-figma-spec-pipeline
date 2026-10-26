import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
export const fmtDate = (iso) => { try { return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
/* ---------------- UI primitives ---------------- */
export const tones = {
  ok: "bg-ok-bg text-ok-fg", warn: "bg-warn-bg text-warn-fg", bad: "bg-bad-bg text-bad-fg",
  neutral: "bg-neutral-bg text-neutral-fg", accent: "bg-accent-soft text-accent-strong",
};
export function Badge({ tone = "neutral", children, icon: I }) {
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap ${tones[tone]}`}>{I && <I size={12} aria-hidden="true" />}{children}</span>;
}
export const ratingTone = (r) => (r === "Strong" ? "ok" : r === "Critical Gap" ? "bad" : "warn");
export const ratingIcon = (r) => (r === "Strong" ? CheckCircle2 : r === "Critical Gap" ? XCircle : AlertTriangle);
export const statusTone = (s) => (s === "Designed" ? "ok" : s === "Blocked" ? "bad" : "neutral");
export const prdTone = (s) => (s === "filled" ? "ok" : s === "partial" ? "warn" : "bad");
export const prdLabel = (s) => (s === "filled" ? "Complete" : s === "partial" ? "Partial" : "Missing in ADO");

export function Btn({ variant = "secondary", size = "md", icon: I, children, className = "", ...p }) {
  const v = {
    primary: "bg-accent text-accent-fg hover:bg-accent-strong shadow-sm",
    secondary: "border border-line bg-surface text-fg hover:bg-surface-2",
    ghost: "text-fg hover:bg-surface-2",
    danger: "border border-line bg-surface text-bad-fg hover:bg-bad-bg",
  }[variant];
  const s = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm";
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${v} ${s} ${className}`} {...p}>{I && <I size={size === "sm" ? 14 : 16} aria-hidden="true" />}{children}</button>;
}

export function Modal({ title, onClose, children, wide, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[88vh] w-full ${wide ? "max-w-5xl" : "max-w-2xl"} flex-col rounded-lg border border-line bg-surface shadow-xl outline-none`}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Btn variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ msg }) {
  if (!msg) return null;
  return <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-fg px-3 py-2 text-sm text-bg shadow-lg" style={{ marginBottom: "env(safe-area-inset-bottom,0px)" }}>{msg}</div>;
}

export function Field({ label, icon: I, children, hint }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{I && <I size={12} aria-hidden="true" />}{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export const inputCls = "h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-muted focus:outline focus:outline-2 focus:outline-accent";

export function Editable({ value, onChange, className = "", placeholder = "—", mono }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (edit)
    return <textarea autoFocus className={`w-full min-w-[10rem] rounded border border-accent bg-surface p-1.5 text-sm text-fg ${mono ? "font-mono" : ""}`} rows={Math.min(8, Math.max(2, Math.ceil((v || "").length / 40)))} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { setEdit(false); if (v !== value) onChange(v); }} onKeyDown={(e) => { if (e.key === "Escape") { setV(value); setEdit(false); } }} />;
  return <button type="button" title="Click to edit" onClick={() => setEdit(true)} className={`group w-full cursor-text rounded text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`}><span className="whitespace-pre-wrap">{value || <span className="text-muted">{placeholder}</span>}</span></button>;
}

export async function copyText(text, notify) {
  try { await navigator.clipboard.writeText(text); notify("Copied to clipboard"); return true; }
  catch { notify("Copy blocked here – select the text and copy it"); return false; }
}

