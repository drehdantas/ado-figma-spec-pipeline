/* Analysis engines: Claude (via the artifact `sample` capability) and a local rules fallback. */

export const STATUSES = ["Designed", "Documented / Dev Note Only - No Comp Needed", "Blocked"];
export const RATINGS = ["Strong", "Needs Clarification", "Critical Gap"];

const clean = (s) => (s || "").replace(/\r/g, "").trim();

export function extractStories(raw) {
  const out = [];
  const re = /(as an?\s+[^,\n]+?,\s*i\s+(?:want|need|would like)[^\n]*)/gi;
  let m;
  while ((m = re.exec(raw))) out.push(m[1].replace(/^[-*•\d.)\s]+/, "").trim());
  return [...new Set(out)];
}

export function extractACs(raw) {
  const lines = clean(raw).split("\n");
  const acs = [];
  let inAC = false;
  let n = 0;
  for (const line0 of lines) {
    const line = line0.trim();
    if (!line) continue;
    if (/acceptance criteria/i.test(line) && line.length < 40) { inAC = true; continue; }
    const m = line.match(/^(?:[-*•]\s*)?(AC[\s_-]?(\d+))\s*[:.)\-–]?\s*(.+)$/i);
    if (m) { acs.push({ id: "AC-" + String(+m[2]).padStart(2, "0"), text: m[3].trim() }); continue; }
    if (inAC) {
      if (/^[A-Z][A-Z &/]{3,}$/.test(line)) { inAC = false; continue; }
      const g = line.match(/^(?:[-*•]|\d+[.)])\s*(.+)$/) || (/^(given|when|then|and)\b/i.test(line) ? [null, line] : null);
      if (g) { n++; acs.push({ id: "AC-" + String(n).padStart(2, "0"), text: g[1].trim() }); }
    }
  }
  return acs;
}

const VAGUE = /\b(appropriate|appropriately|properly|user[- ]friendly|fast|quickly|easy|easily|etc\.?|tbd|tbc|as needed|some|various|intuitive|should handle|if possible|n\/a)\b/i;
const UI = /\b(screen|page|button|column|modal|dialog|list|table|filter|toggle|switch|breadcrumb|menu|show|shown|display|visible|hidden|banner|tab|footer|header|field|form|card|badge|tag|select|bar|warning|label|renamed?|view)\b/i;

function rateStory(s) {
  const hasSo = /so that|so i can|in order to/i.test(s);
  const vague = VAGUE.test(s) || /\b(manage|handle|support)\b/i.test(s.split(/,/)[1] || "");
  if (/delete|remove/i.test(s) && !/confirm|undo/i.test(s)) return ["Critical Gap", "Destructive action with no confirmation, undo or scope limit stated."];
  if (!hasSo && vague) return ["Critical Gap", "No benefit clause and the action is too broad to design or test."];
  if (!hasSo) return ["Needs Clarification", "Missing the 'so that' benefit: the design can't be judged against a goal."];
  if (vague) return ["Needs Clarification", "Wording is vague (e.g. 'manage', 'appropriate'); split into concrete actions."];
  return ["Strong", "Persona, action and benefit are all present."];
}

const GAP_RULES = [
  { test: (t) => /delete|remove/i.test(t) && !/confirm/i.test(t), category: "Bulk action", severity: "Critical Gap", title: "Destructive action without confirmation", detail: "Delete/remove is mentioned but no confirmation, undo or limit is specified.", ask: "Can we require a confirmation that repeats the count and offer Undo?" },
  { test: (t) => /select[- ]all|bulk|multiple|many/i.test(t) && !/count|total/i.test(t), category: "Bulk action", severity: "Needs Clarification", title: "Bulk selection scope unclear", detail: "Does select-all cover the visible page or every row matching the filters?", ask: "Confirm select-all scope and whether the bar shows the full count." },
  { test: (t) => /delete|remove/i.test(t) === false && /list|table|records|stores|items/i.test(t) && !/bulk|select[- ]all/i.test(t), category: "Bulk action", severity: "Needs Clarification", title: "No bulk actions defined", detail: "The feature lists many records but no bulk action (status change, export, delete) is defined.", ask: "Which bulk actions do users need on this list?" },
  { test: (t) => !/empty|no results|no data|zero/i.test(t), category: "Empty state", severity: "Needs Clarification", title: "Empty and no-result states missing", detail: "No copy or behaviour for a first-run empty list or filters that return nothing.", ask: "Approve empty-state and no-results copy with a Clear filters action." },
  { test: (t) => !/error|fail|failure|timeout|unavailable/i.test(t), category: "Error state", severity: "Needs Clarification", title: "Error states missing", detail: "No behaviour for failed saves, failed loads or service outages.", ask: "What should users see and do when a save or load fails?" },
  { test: (t) => /fail/i.test(t) && !/retry|contact|support/i.test(t), category: "Error state", severity: "Needs Clarification", title: "Failure without recovery path", detail: "A failure is shown but no next step (retry, contact) is defined.", ask: "Should users get a Retry action or a support contact?" },
  { test: (t) => /\b(red|green|amber|yellow|colou?r)\b/i.test(t), category: "Accessibility", severity: "Needs Clarification", title: "Meaning carried by color", detail: "Requirements describe state by color. WCAG 1.4.1 requires a text or icon equivalent.", ask: "Can we pair every color state with a word and icon?" },
  { test: (t) => !/role|permission|admin|access|read-only|readonly/i.test(t), category: "Permissions", severity: "Needs Clarification", title: "No role or permission rules", detail: "Who can see, edit or configure this is not stated.", ask: "Provide the role matrix for view / edit / configure." },
  { test: (t) => /sync|integrat|import|api/i.test(t) && !/conflict|overwrite|preserv/i.test(t), category: "Business rule", severity: "Needs Clarification", title: "Sync conflict rules missing", detail: "Data comes from another system but conflicts and overwrites are not defined.", ask: "Which fields does the sync own, and which are owned by this product?" },
  { test: (t) => /location|nearest|closest|gps/i.test(t) && !/denied|permission/i.test(t), category: "Edge case", severity: "Needs Clarification", title: "Location permission denied", detail: "The flow assumes location is always available.", ask: "What is the fallback when location access is denied?" },
  { test: (t) => /status|active|inactive/i.test(t) && !/warning|confirm/i.test(t), category: "Business rule", severity: "Needs Clarification", title: "Impact of status change", detail: "Changing status may affect linked records; no warning or rule given.", ask: "Should a status change warn when the record is in use?" },
];

function recFor(t) {
  const r = [];
  if (/status|active|inactive/i.test(t)) r.push("Status tags carry words, not color alone (WCAG 1.4.1).");
  if (/toggle|switch/i.test(t)) r.push("Switch uses role=switch, aria-checked and a visible label.");
  if (/delete|remove/i.test(t)) r.push("Confirm destructive actions; repeat the count; offer Undo (Nielsen #3 user control).");
  if (/select[- ]all|bulk/i.test(t)) r.push("Select-all accessible name includes the count.");
  if (/filter/i.test(t)) r.push("Provide a no-results state with Clear filters.");
  if (/fail|error/i.test(t)) r.push("Pair error color with icon + text; use role=alert.");
  if (/sync/i.test(t)) r.push("Show last sync time (relative + absolute) persistently, not as a toast.");
  if (/breadcrumb/i.test(t)) r.push("Follow the design system's breadcrumb placement; log any local precedent that differs.");
  if (/column|table|list/i.test(t)) r.push("Numbers right-aligned with tabular figures; uppercase xs headers (DATA_TABLES.md).");
  if (/modal|dialog|warning/i.test(t)) r.push("Focus trap, Escape closes, focus returns to trigger.");
  if (/read-only|readonly/i.test(t)) r.push("Use readonly, not disabled, so values stay readable (4.5:1).");
  if (/button|footer|save|cancel/i.test(t)) r.push("One primary per view; Cancel as outline secondary (BUTTONS.md).");
  return r.slice(0, 2).join(" ") || "Check against Nielsen heuristics #1 (visibility) and #5 (error prevention).";
}

function questionFor(t) {
  const q = [];
  if (VAGUE.test(t)) q.push(`Define "${t.match(VAGUE)[0]}" in measurable terms.`);
  if (/warning|warn/i.test(t)) q.push("What happens after the user confirms the warning?");
  if (/delete|remove/i.test(t)) q.push("Is the action reversible?");
  if (/sync/i.test(t)) q.push("Which system wins on conflict?");
  if (/location|closest/i.test(t)) q.push("Radius, result count and denied-permission fallback?");
  return q.join(" ") || "—";
}

/* Map PRD template sections to content found in the ADO (keyword routing). */
function routePRD(sections, ado, ctx, stories, acs, gaps) {
  const raw = clean(ado.raw);
  const block = (name) => {
    const re = new RegExp("(?:^|\\n)\\s*" + name + "[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Z &/]{3,}\\s*\\n|$)", "i");
    const m = raw.match(re);
    return m ? m[1].trim() : "";
  };
  const desc = block("DESCRIPTION") || block("Description") || raw.split(/\n\s*\n/)[1] || "";
  const logic = block("BUSINESS LOGIC") || block("Business rules");
  const firstLine = raw.split("\n")[0] || ado.title || "";
  const title = ado.title || firstLine.replace(/^(feature|user story|epic)\s*\d*:?\s*/i, "");
  const markets = [...new Set((raw.match(/\b(EU|UK|US|USA|LATAM|APAC|EMEA|Mexico|Brazil|India|Germany|France|Spain|Canada|Japan|[A-Z]{2}(?= market))\b/g) || []))].join(", ");
  const res = {};
  for (const s of sections) {
    const k = (s.id + " " + s.title).toLowerCase();
    let c = "", st = "missing";
    if (/^1 |document control/.test(k)) { c = `PRD Title: ${title}\nVersion: 0.1 (generated from ${ado.id || "ADO"})\nDate Created: ${new Date().toLocaleDateString("en-GB")}\nAuthor: ${ado.po || "not provided"}\nApprovers: not provided`; st = "partial"; }
    else if (/change request/.test(k)) { c = `0.1 · ${new Date().toLocaleDateString("en-GB")} · Initial draft generated from ${ado.id || "ADO"} · N/A · ${ado.po || "—"} · pending`; st = "filled"; }
    else if (/overview/.test(k) && desc) { c = `Initiative Name: ${title}\nOverview: ${desc.split(/(?<=\.)\s/).slice(0, 3).join(" ")}${markets ? "\nMarkets: " + markets : ""}`; st = "filled"; }
    else if (/roles|stakeholders/.test(k) && (ado.po || ado.stakeholders)) { c = [ado.po && `Product Owner: ${ado.po}`, ado.stakeholders && `Stakeholders: ${ado.stakeholders}`].filter(Boolean).join("\n"); st = "partial"; }
    else if (/problem/.test(k) && desc) { c = desc; st = "partial"; }
    else if (/current-state/.test(k) && /today|currently|existing|manual/i.test(raw)) { c = (raw.match(/[^.\n]*(today|currently|existing|manual)[^.\n]*\./gi) || []).join(" "); st = "partial"; }
    else if (/objectives/.test(k) && stories.length) { c = stories.map((x, i) => `${i + 1}. ${(x.split(/so that/i)[1] || x).trim().replace(/^,?\s*/, "")}`).join("\n"); st = "partial"; }
    else if (/scope/.test(k) && acs.length) { c = "In scope:\n" + acs.map((a) => `- ${a.id} ${a.text}`).join("\n") + "\nOut of scope: not provided"; st = "partial"; }
    else if (/assumptions/.test(k) && logic) { c = logic; st = "partial"; }
    else if (/risks/.test(k) && gaps.length) { c = gaps.filter((g) => g.severity === "Critical Gap").map((g, i) => `${i + 1}. ${g.title}`).join("\n") || ""; st = c ? "partial" : "missing"; }
    else if (/personas/.test(k) && stories.length) { c = [...new Set(stories.map((x) => (x.match(/as an?\s+([^,]+)/i) || [])[1]).filter(Boolean))].map((p) => `- ${p}`).join("\n"); st = "partial"; }
    else if (/user stories/.test(k) && (stories.length || acs.length)) { c = `See the User Story & UX Readiness Audit tab (${stories.length} stories, ${acs.length} acceptance criteria).`; st = stories.length ? "filled" : "partial"; }
    else if (/user flow/.test(k) && ctx.figmaUrl) { c = `Figma: ${ctx.figmaUrl}\nJourney node: ${ctx.journeyNode}`; st = "partial"; }
    else if (/journey map/.test(k) && ctx.journeyNode) { c = `Journey node ${ctx.journeyNode}. Pain points not provided.`; st = "partial"; }
    else if (/product type/.test(k) && /existing|already|current/i.test(raw)) { c = "Built on an existing product (named in the ADO)."; st = "partial"; }
    else if (/technical|data, ai/.test(k) && /sync|data|api|refresh/i.test(raw)) { c = (raw.match(/[^.\n]*(sync|data model|api|refresh|back end)[^.\n]*/gi) || []).slice(0, 4).join("\n"); st = "partial"; }
    else if (/open questions/.test(k)) { c = "See Open Questions in the Validation Matrix."; st = "filled"; }
    else if (/glossary/.test(k)) { const ab = [...new Set(raw.match(/\b[A-Z]{2,5}\b/g) || [])].filter((a) => !/^AC$|^ADO$/.test(a)).slice(0, 10); if (ab.length) { c = ab.join(" · ") + " – definitions not provided"; st = "partial"; } }
    else if (/reference/.test(k)) { c = [ado.link || ado.id, ctx.sotUrl].filter(Boolean).join("\n"); st = c ? "partial" : "missing"; }
    res[s.id] = { status: st, content: c };
  }
  return res;
}

export function localAnalyze(ado, ctx) {
  const raw = clean(ado.raw);
  const stories = extractStories(raw);
  const acs = extractACs(raw);
  const gaps = GAP_RULES.filter((g) => g.test(raw)).map(({ test, ...g }) => g);
  // numbering gaps
  const nums = acs.map((a) => +a.id.slice(3)).sort((a, b) => a - b);
  const missing = [];
  for (let i = 1; i < (nums[nums.length - 1] || 0); i++) if (!nums.includes(i)) missing.push(i);
  missing.forEach((n) => gaps.unshift({ category: "Scope", severity: "Critical Gap", title: `AC-${String(n).padStart(2, "0")} is missing`, detail: "Acceptance criteria numbering has a gap.", ask: `Was AC-${String(n).padStart(2, "0")} removed on purpose? If not, what did it cover?` }));
  if (!stories.length) gaps.unshift({ category: "Scope", severity: "Critical Gap", title: "No user stories", detail: "The work item has no 'As a … I want … so that …' stories, so the user goal must be inferred.", ask: "Who is the primary user and what outcome do they need?" });

  const node = (ctx.journeyNode || "J.x").split(" ")[0];
  let screen = 0;
  const allAcs = [...acs];
  missing.forEach((n) => allAcs.push({ id: `AC-${String(n).padStart(2, "0")}`, text: "Absent from the work item", missing: true }));
  allAcs.sort((a, b) => a.id.localeCompare(b.id));
  const validation = allAcs.map((a) => {
    if (a.missing) return { ac: a.id, requirement: "Absent from the work item", status: "Blocked", node: "—", questions: `Was ${a.id} removed on purpose? If not, what did it cover?`, recs: "Hold sign-off until the PO confirms." };
    const ui = UI.test(a.text);
    const vague = VAGUE.test(a.text);
    return {
      ac: a.id,
      requirement: a.text,
      status: vague ? "Blocked" : ui ? "Designed" : "Documented / Dev Note Only - No Comp Needed",
      node: ui ? `${node}.${++screen}` : `${node} (dev note)`,
      questions: questionFor(a.text),
      recs: recFor(a.text),
    };
  });

  const ratedStories = stories.map((s, i) => { const [rating, critique] = rateStory(s); return { id: `US-${i + 1}`, text: s, rating, critique }; });
  const crit = gaps.filter((g) => g.severity === "Critical Gap").length;
  const verdict = !stories.length || crit > 2 ? "Insufficient" : crit || gaps.length > 4 ? "Partially sufficient" : "Sufficient";

  const cols = ctx.driftColumns;
  const has = (re) => re.test(raw);
  const drift = [
    { aspect: "Data source", primary: has(/sync/i) ? "Synced (per ADO)" : "Manual (per ADO)", variantA: "Confirm with PO", variantB: "Confirm with PO", drift: "Not covered by the design system.", rec: "Drive actions from a market-level source setting." },
    { aspect: "Regional fields", primary: (raw.match(/\b(State|District|Region|Retailer|Province|City)\b/g) || []).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "Not specified", variantA: "Confirm", variantB: "Confirm", drift: "Regional field names are not in the design system.", rec: "Per-market field config; columns, filters and detail page read the same config." },
    { aspect: "Breadcrumb placement", primary: has(/breadcrumb/i) ? "Specified in ADO" : "Not specified", variantA: "Local precedent: check the source-of-truth file", variantB: "—", drift: "Design system and existing screens may place it differently.", rec: ctx.dsRule === "strict" ? "Follow the design system; log the local precedent as drift." : "Follow the local precedent for consistency with live screens; log the deviation." },
    { aspect: "Button hierarchy", primary: has(/save|cancel/i) ? "Cancel / Save mentioned" : "Not specified", variantA: "Local precedent: check existing screens", variantB: "—", drift: "Design systems usually allow one primary per view, outlined secondary, ghost only in tables.", rec: "Primary Save, outline Cancel; destructive actions in a confirmation dialog." },
    { aspect: "Status semantics", primary: has(/status|active|inactive/i) ? "Status defined" : "No status", variantA: "Confirm", variantB: "Confirm", drift: "Use the design system's status tokens (success / warning / critical) with text.", rec: "Tags with words + Design-system status tokens with words; never color alone." },
    { aspect: "Bulk actions", primary: has(/bulk|select[- ]all/i) ? "Defined" : "Not defined", variantA: "Confirm", variantB: "Confirm", drift: "Destructive actions require confirmation.", rec: "Confirmation repeating the count; hide actions the market cannot use." },
    { aspect: "Data table density", primary: "Lists in scope", variantA: "—", variantB: "—", drift: "DATA_TABLES.md: text-sm rows, xs uppercase headers, numbers right-aligned.", rec: "Apply DATA_TABLES.md as-is." },
  ];

  const toCards = (arr, kind) => arr.map((g) => ({ title: g.title, body: kind === "q" ? g.ask : g.detail, answer: "", affects: "", done: false }));
  const reviewNotes = {
    summary: "",
    openQuestions: toCards(gaps.filter((g) => g.category !== "Accessibility"), "q"),
    recommendations: [...new Set(validation.map((v) => v.recs))].filter((r) => r && !r.startsWith("Hold")).slice(0, 8).map((r, i) => ({ title: r.split(/[.;(]/)[0].slice(0, 60), body: r, answer: "", affects: validation.filter((v) => v.recs === r).map((v) => v.ac).join(", "), done: false })),
    accessibility: [
      ...gaps.filter((g) => g.category === "Accessibility").map((g) => ({ title: g.title, body: g.detail, answer: "", affects: "", done: false })),
      ...(has(/toggle|switch/i) ? [{ title: "Switch name and state", body: "Switches use role=switch, aria-checked and a visible label.", answer: "", affects: "", done: false }] : []),
      ...(has(/modal|dialog|warning/i) ? [{ title: "Dialog keyboard support", body: "Focus trap, Escape closes, focus returns to the trigger.", answer: "", affects: "", done: false }] : []),
      { title: "Status must not rely on color", body: "Every state shown by color also carries a word or icon (WCAG 1.4.1).", answer: "", affects: "", done: false },
      { title: "Contrast", body: "Text 4.5:1, UI components and focus rings 3:1 (WCAG 1.4.3 / 1.4.11).", answer: "", affects: "", done: false },
    ],
  };

  return {
    engine: "Local rules (no AI)",
    generatedAt: new Date().toISOString(),
    prd: routePRD(ctx.sections, ado, ctx, stories, acs, gaps),
    stories: ratedStories,
    ux: {
      verdict,
      problem: verdict === "Sufficient"
        ? "The stories name users, actions and benefits, and the criteria are concrete enough to design against. Review the gaps below before sign-off."
        : `The work item ${stories.length ? "describes system behaviour more than user goals" : "has no user stories"}, so parts of the design rest on assumptions. ${gaps.length} gaps found, ${crit} critical. Use the questions below with the Product Owner before final design.`,
      gaps,
    },
    validation,
    driftColumns: cols,
    drift,
    reviewNotes,
  };
}

/* ---------- Claude engine ---------- */
export function buildAnalysisPrompt(ado, ctx) {
  const sections = ctx.sections.map((s) => `${s.id} ${s.title} – ${s.guidance || ""}`).join("\n");
  const ds = ctx.dsFiles.map((f) => `--- ${f.path}\n${f.content}`).join("\n").slice(0, 60000);
  return `You are a senior product designer and product analyst for ${ctx.productName || "an enterprise product"}. Convert a raw Azure DevOps work item into a structured PRD and a design-readiness review.

DESIGN SYSTEM: ${ctx.dsName} · rule: ${ctx.dsRuleText}
JOURNEY NODE (sitemap parent for all screens): ${ctx.journeyNode}
FIGMA TARGET: ${ctx.figmaUrl || "not given"}
SOT REFERENCE: ${ctx.sotUrl || "not given"}
MARKETS TO COMPARE IN THE DRIFT MATRIX: primary = ${ctx.driftColumns.primary}; variantA = ${ctx.driftColumns.variantA}; variantB = ${ctx.driftColumns.variantB}

PRD TEMPLATE SECTIONS (id title – guidance):
${sections}

DESIGN SYSTEM FILES:
${ds}

MATRIX STYLE GUIDE:
${ctx.styleGuide}

ADO WORK ITEM (ID ${ado.id || "?"}, PO ${ado.po || "?"}, stakeholders ${ado.stakeholders || "?"}, link ${ado.link || "?"}):
"""
${ado.raw}
"""

RULES
- Use only facts in the ADO. If a PRD section has no support, status "missing" and content "". If partly supported, status "partial" and say what's missing.
- Rate each user story: "Strong", "Needs Clarification" or "Critical Gap", with a one-to-two sentence critique naming the missing piece.
- If the ADO has no user stories, derive candidate stories from the description and rate them.
- UX gaps: look for missing edge cases, empty/error/loading states, bulk actions (e.g. missing bulk delete or missing confirmation), permissions, sync conflicts, ambiguous business rules, accessibility (WCAG color reliance). Each gap gets a concrete question for the PO.
- Validation matrix: one row per AC (include gaps in AC numbering as "Blocked" rows). status is exactly one of: "Designed", "Documented / Dev Note Only - No Comp Needed", "Blocked". node = screen ids under the journey node, e.g. ${(ctx.journeyNode || "J.1").split(" ")[0]}.1. recs cite Nielsen heuristics, WCAG criteria or design-system files where relevant.
- Drift matrix: 6–10 rows comparing the three markets, plus how the design system differs from the product's local precedent (breadcrumb placement, button hierarchy, synced vs manual data, regional fields). Write "Assumed – confirm" where unknown.
- Review notes: open questions, recommendations, accessibility concerns. "affects" lists screens and ACs like "J1.2.1.1, J1.2.1.4 · AC-3, AC-5".
- Plain, short sentences.

Return ONLY JSON, no prose, matching:
{"prd":{"<section id>":{"status":"filled|partial|missing","content":"..."}},
"stories":[{"id":"US-1","text":"...","rating":"Strong|Needs Clarification|Critical Gap","critique":"..."}],
"ux":{"verdict":"Sufficient|Partially sufficient|Insufficient","problem":"paragraph","gaps":[{"category":"Edge case|Empty state|Error state|Bulk action|Business rule|Permissions|Accessibility|Scope","severity":"Needs Clarification|Critical Gap","title":"...","detail":"...","ask":"question for the PO"}]},
"validation":[{"ac":"AC-01","requirement":"short summary","status":"...","node":"...","questions":"...","recs":"..."}],
"drift":[{"aspect":"...","primary":"...","variantA":"...","variantB":"...","drift":"...","rec":"..."}],
"reviewNotes":{"openQuestions":[{"title":"...","body":"...","answer":"","affects":"...","done":false}],"recommendations":[...same shape],"accessibility":[...same shape]}}`;
}

export function parseJSONLoose(text) {
  const t = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("No JSON in the answer");
  return JSON.parse(t.slice(a, b + 1));
}

export function normalize(r, ctx) {
  const out = { ...r };
  out.prd = r.prd || {};
  out.stories = (r.stories || []).map((s, i) => ({ id: s.id || `US-${i + 1}`, text: s.text || "", rating: RATINGS.includes(s.rating) ? s.rating : "Needs Clarification", critique: s.critique || "" }));
  out.ux = { verdict: r.ux?.verdict || "Partially sufficient", problem: r.ux?.problem || "", gaps: r.ux?.gaps || [] };
  out.validation = (r.validation || []).map((v) => ({ ac: v.ac, requirement: v.requirement || "", status: STATUSES.find((s) => s.toLowerCase().startsWith(String(v.status || "").toLowerCase().slice(0, 6))) || "Designed", node: v.node || "—", questions: v.questions || "—", recs: v.recs || "—" }));
  out.drift = r.drift || [];
  out.driftColumns = ctx.driftColumns;
  const rn = r.reviewNotes || {};
  const fix = (a) => (a || []).map((c) => ({ title: c.title || "", body: c.body || "", answer: c.answer || "", affects: c.affects || "", done: !!c.done }));
  out.reviewNotes = { summary: "", openQuestions: fix(rn.openQuestions), recommendations: fix(rn.recommendations), accessibility: fix(rn.accessibility) };
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ---------- Template / file parsing ---------- */
export function parseTemplateText(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  let group = "General";
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/^#+\s*/, "").replace(/\*\*/g, "");
    const g = l.match(/^SECTION\s+(\d+)\s*[:.\-–]\s*(.+?)(\s+\d+)?$/i);
    if (g) { group = `Section ${g[1]} · ${g[2].replace(/\s+\d+$/, "")}`; if (!seen.has(g[1])) { seen.add(g[1]); } continue; }
    const h = l.match(/^(\d+\.\d+)\s+(.+?):?(\s+\d+)?$/);
    if (h && h[2].length < 80 && !seen.has(h[1])) {
      seen.add(h[1]);
      const next = lines[i + 1] && !/^\d+\.\d+\s/.test(lines[i + 1]) ? lines[i + 1].slice(0, 200) : "";
      out.push({ id: h[1], group, title: h[2].replace(/:$/, ""), guidance: next });
    } else if (/^#{1,3}\s/.test(lines[i]) && !h) {
      const t = l.replace(/:$/, "");
      if (t.length < 80) out.push({ id: String(out.length + 1), group, title: t, guidance: "" });
    }
  }
  return out;
}

export async function docxToText(buf) {
  const zip = await window.JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

export async function zipToFiles(buf) {
  const zip = await window.JSZip.loadAsync(buf);
  const files = [];
  for (const [path, f] of Object.entries(zip.files)) {
    if (f.dir || /__MACOSX|\/\./.test(path)) continue;
    if (!/\.(md|markdown|json|txt|css|ya?ml)$/i.test(path)) continue;
    files.push({ path, content: await f.async("string") });
  }
  const top = files.length && files.every((f) => f.path.includes("/")) ? files[0].path.split("/")[0] + "/" : "";
  if (top && files.every((f) => f.path.startsWith(top))) files.forEach((f) => (f.path = f.path.slice(top.length)));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/* ---------- Exports ---------- */
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
const csvCell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export function validationMD(rows) {
  return `| AC ID | Requirement Summary | Design Status | Figma Screen / Journey Node | Open Questions & Required PO Decisions | UX & Accessibility Recommendations |\n|---|---|---|---|---|---|\n` +
    rows.map((v) => `| ${esc(v.ac)} | ${esc(v.requirement)} | ${esc(v.status)} | ${esc(v.node)} | ${esc(v.questions)} | ${esc(v.recs)} |`).join("\n");
}
export function driftMD(rows, c) {
  return `| Component / Feature Aspect | ${c.primary} | ${c.variantA} | ${c.variantB} | Design System vs. Local Precedent Drift | Strategic Recommendation / Conditional Logic |\n|---|---|---|---|---|---|\n` +
    rows.map((d) => `| ${esc(d.aspect)} | ${esc(d.primary)} | ${esc(d.variantA)} | ${esc(d.variantB)} | ${esc(d.drift)} | ${esc(d.rec)} |`).join("\n");
}
export function validationCSV(rows) {
  return ["AC ID,Requirement Summary,Design Status,Figma Screen / Journey Node,Open Questions & Required PO Decisions,UX & Accessibility Recommendations", ...rows.map((v) => [v.ac, v.requirement, v.status, v.node, v.questions, v.recs].map(csvCell).join(","))].join("\n");
}
export function driftCSV(rows, c) {
  return [["Component / Feature Aspect", c.primary, c.variantA, c.variantB, "Design System vs. Local Precedent Drift", "Strategic Recommendation / Conditional Logic"].map(csvCell).join(","), ...rows.map((d) => [d.aspect, d.primary, d.variantA, d.variantB, d.drift, d.rec].map(csvCell).join(","))].join("\n");
}
export function prdMD(sections, prd, ado) {
  let g = "";
  let out = `# ${ado.title || "Product Requirements Document"}\n\n_Source: ${ado.id || "ADO"}${ado.link ? " · " + ado.link : ""} · PO: ${ado.po || "—"}_\n`;
  for (const s of sections) {
    if (s.group !== g) { g = s.group; out += `\n## ${g}\n`; }
    const v = prd[s.id] || { status: "missing", content: "" };
    out += `\n### ${s.id} ${s.title}${v.status !== "filled" ? ` _(${v.status === "missing" ? "MISSING – not provided by ADO" : "PARTIAL"})_` : ""}\n\n${v.content || "_Not provided._"}\n`;
  }
  return out;
}
export function reviewNotesMD(rn, validation) {
  const cov = validation.map((v) => `| ${v.ac} | ${esc(v.requirement)} | ${esc(v.node)} | ${v.status === "Blocked" ? "Missing" : v.status.startsWith("Doc") ? "Documented only" : "Designed"} |`).join("\n");
  const cards = (t, arr) => `\n### ${t} (${arr.length})\n` + arr.map((c, i) => `\n**${i + 1}. ${c.title}**${c.done ? " — Completed" : ""}\n${c.body}${c.answer ? `\nAnswer: ${c.answer}` : ""}${c.affects ? `\nAffects ${c.affects}` : ""}`).join("\n");
  return `## Review notes\n\n### Acceptance-criteria coverage\n\n| AC | Requirement | Screens | Status |\n|---|---|---|---|\n${cov}\n` + cards("Open questions", rn.openQuestions) + cards("Recommendations", rn.recommendations) + cards("Accessibility concerns", rn.accessibility);
}
