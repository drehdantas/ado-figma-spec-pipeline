/* PO review pack PDF: readiness analysis + questions, built with jsPDF (UMD global). */
const latin = (s) => String(s ?? "")
  .replace(/→/g, "->").replace(/↳/g, ">").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=").replace(/[✓✔]/g, "v").replace(/×/g, "x").replace(/›/g, ">")
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, "?");

export function buildPdf({ ado, res, sections, poQuestions }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 48, CW = W - M * 2;
  let y = M;
  const ink = [15, 23, 42], muted = [100, 116, 139], accent = [67, 56, 202], line = [226, 232, 240];
  const tone = { "Strong": [[220, 252, 231], [22, 101, 52]], "Needs Clarification": [[254, 243, 199], [146, 64, 14]], "Critical Gap": [[254, 226, 226], [153, 27, 27]] };
  const need = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const text = (s, { size = 10, bold = false, color = ink, indent = 0, gap = 4, width } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(latin(s), (width || CW) - indent);
    const lh = size * 1.35;
    for (const l of lines) { need(lh); doc.text(l, M + indent, y + size); y += lh; }
    y += gap;
  };
  const h2 = (s) => { y += 8; need(40); doc.setDrawColor(...line); doc.line(M, y, W - M, y); y += 14; text(s, { size: 13, bold: true, color: accent, gap: 6 }); };
  const badge = (label, x) => {
    const [bg, fg] = tone[label] || [[226, 232, 240], [51, 65, 85]];
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    const w = doc.getTextWidth(latin(label)) + 10;
    doc.setFillColor(...bg); doc.roundedRect(x, y, w, 13, 2, 2, "F");
    doc.setTextColor(...fg); doc.text(latin(label), x + 5, y + 9.5);
    return w;
  };

  text("PO review pack", { size: 9, bold: true, color: muted, gap: 2 });
  text(ado.title || "Untitled work item", { size: 20, bold: true, gap: 4 });
  text([ado.id, ado.po && `PO: ${ado.po}`, ado.stakeholders && `Stakeholders: ${ado.stakeholders}`, `Generated ${new Date().toLocaleDateString("en-GB")}`, `Engine: ${res.engine}`].filter(Boolean).join("  ·  "), { size: 9, color: muted, gap: 2 });
  if (ado.link) text(ado.link, { size: 9, color: accent, gap: 6 });

  h2("1. Readiness summary");
  const rc = res.stories.reduce((a, s) => ((a[s.rating] = (a[s.rating] || 0) + 1), a), {});
  const v = res.validation;
  text(`Verdict: ${res.ux.verdict}`, { size: 11, bold: true });
  text(res.ux.problem, { gap: 8 });
  text(`Stories: ${res.stories.length} (${rc["Strong"] || 0} strong, ${rc["Needs Clarification"] || 0} need clarification, ${rc["Critical Gap"] || 0} critical gaps)   ·   ACs: ${v.length} (${v.filter((r) => r.status === "Designed").length} designed, ${v.filter((r) => r.status.startsWith("Doc")).length} documented only, ${v.filter((r) => r.status === "Blocked").length} blocked)`, { size: 9, color: muted });

  h2(`2. Questions for ${ado.po || "the Product Owner"} (${poQuestions.length})`);
  poQuestions.forEach((q, i) => {
    need(46);
    const w = badge(q.severity, M);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(latin(q.category.toUpperCase()), M + w + 8, y + 9.5);
    y += 18;
    text(`${i + 1}. ${q.title}`, { size: 11, bold: true, gap: 2 });
    if (q.detail) text(q.detail, { size: 9.5, color: muted, gap: 2 });
    text(`Question: ${q.ask}`, { size: 10, gap: q.answer ? 2 : 10, indent: 0 });
    if (q.answer) text(`Proposed answer (to confirm): ${q.answer}`, { size: 9.5, color: accent, gap: 10 });
  });

  const open = res.reviewNotes.openQuestions.filter((c) => !c.done);
  if (open.length) {
    h2(`3. Open questions from design review (${open.length})`);
    open.forEach((c, i) => { text(`${i + 1}. ${c.title}`, { size: 10.5, bold: true, gap: 2 }); text(c.body, { size: 9.5, gap: 2 }); if (c.affects) text(`Affects ${c.affects}`, { size: 8.5, color: muted, gap: 8 }); });
  }

  h2("4. User stories");
  res.stories.forEach((s) => {
    need(40);
    badge(s.rating, M); y += 18;
    text(`${s.id}  ${s.text}`, { size: 10, bold: true, gap: 2 });
    text(s.critique, { size: 9.5, color: muted, gap: 8 });
  });

  const acq = v.filter((r) => r.questions && r.questions !== "—" && !/^Resolved/i.test(r.questions));
  if (acq.length) {
    h2("5. Acceptance-criteria decisions needed");
    acq.forEach((r) => { text(`${r.ac}  ${r.requirement}${r.status === "Blocked" ? "  [BLOCKED]" : ""}`, { size: 10, bold: true, gap: 1 }); text(r.questions, { size: 9.5, gap: 6, indent: 12 }); });
  }

  const gaps = sections.filter((s) => (res.prd[s.id]?.status || "missing") !== "filled");
  if (gaps.length) {
    h2("6. PRD sections still missing or partial");
    gaps.forEach((s) => { const st = res.prd[s.id]?.status || "missing"; text(`${s.id} ${s.title} — ${res.prd[s.id]?.proposed ? "proposed answer, to confirm" : st === "missing" ? "missing" : "partial"}`, { size: 10, bold: st === "missing", gap: 1 }); text(`Template asks for: ${s.guidance}`, { size: 8.5, color: muted, gap: 5, indent: 12 }); });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(latin(`${ado.id || ""} PO review pack · page ${i} of ${pages}`), M, H - 24); }
  return doc.output("arraybuffer");
}
