/* Neutral starter content. Replace it in the app (Configuration) with your own template, design system and sitemap. */

const S = (id, group, title, guidance) => ({ id, group, title, guidance });
export const PRD_SECTIONS = [
  S("1", "Section 1 · Document Control", "Document Control", "Title, product name, version, date created, author, approvers."),
  S("1.1", "Section 1 · Document Control", "Approvals", "Who signs off (Product Owner, product lead, engineering lead) and when."),
  S("1.2", "Section 1 · Document Control", "Change Log", "Version, date, change, reason, author, approver."),
  S("2.1", "Section 2 · Overview", "Product Overview", "Initiative name, 2–3 sentence summary, markets or segments, business area."),
  S("2.2", "Section 2 · Overview", "Business Case", "Qualitative goals and quantitative value (savings, revenue, effort reduced)."),
  S("2.3", "Section 2 · Overview", "Background & Strategic Alignment", "Why now: strategy, research, competition or user feedback."),
  S("2.4", "Section 2 · Overview", "Roles & Responsibilities", "Requestor, sponsor, Product Owner, other accountable stakeholders."),
  S("3.1", "Section 3 · Business Requirements", "Problem Statement", "The current challenge and its impact, with data where possible."),
  S("3.2", "Section 3 · Business Requirements", "Current-State Assessment", "How things work today, pain points and gaps."),
  S("3.3", "Section 3 · Business Requirements", "Business Objectives", "Numbered outcomes the business wants."),
  S("3.4", "Section 3 · Business Requirements", "Scope", "In scope and out of scope, numbered."),
  S("3.5", "Section 3 · Business Requirements", "Assumptions", "Assumptions behind the business case."),
  S("3.6", "Section 3 · Business Requirements", "Desired Timeline & Rationale", "Target dates or release cycles, and why."),
  S("3.7", "Section 3 · Business Requirements", "Risks", "What could hurt delivery or adoption."),
  S("4.1", "Section 4 · Users & Experience", "User Personas", "Target users, what they do, what they need."),
  S("4.2", "Section 4 · Users & Experience", "User Stories & Use Cases", "As a [persona], I want to [action], so that I can [benefit]. Plus scenario use cases."),
  S("4.3", "Section 4 · Users & Experience", "User Flow & Design", "Design file links and the core journey."),
  S("4.4", "Section 4 · Users & Experience", "Journey Map", "Pain points and opportunities at each stage."),
  S("5.1", "Section 5 · Product Requirements", "Product Type", "New product, or built on an existing one (name it)."),
  S("5.2", "Section 5 · Product Requirements", "Product Stakeholders", "Owners of the requirements: product, design, engineering, data."),
  S("5.3", "Section 5 · Product Requirements", "Data, AI & Technical Requirements", "Platform, data required, refresh, access rules, analytics, AI, automation."),
  S("6.1", "Section 6 · Post-Launch", "Success Metrics & Measurement", "What success looks like and how it is measured."),
  S("6.2", "Section 6 · Post-Launch", "Post-Launch Monitoring Plan", "What is monitored after launch and how often."),
  S("6.3", "Section 6 · Post-Launch", "Open Questions", "Unresolved questions for development or later."),
  S("6.4", "Section 6 · Post-Launch", "Future Iterations / Backlog", "Ideas explicitly out of scope for the first release."),
  S("7.1", "Section 7 · Appendix", "Glossary", "Acronyms and terms."),
  S("7.2", "Section 7 · Appendix", "References", "Links to research, specs, design files and related work items."),
];
export const PRD_RAW = PRD_SECTIONS.map((s) => `${s.id} ${s.title}\n${s.guidance}`).join("\n\n");
export const PRD_NAME = "Starter PRD template";

const f = (path, content) => ({ path, content: content.trim() + "\n" });
export const SAMPLE_DS_FILES = [
  f("DESIGN.md", `# Example Design System
Read this file first. It routes to tokens and component rules.

## Principles
1. Use only the tokens in design/TOKENS.md. No new hex values or spacing.
2. Dense, scannable layouts for operational screens; one primary action per view.
3. WCAG 2.1 AA: 4.5:1 text contrast, visible focus, state never shown by color alone.

## Files
- design/TOKENS.md – color, type, spacing, radius
- design/components/BUTTONS.md
- design/components/DATA_TABLES.md
- design/components/FEEDBACK.md – notifications, empty and error states`),
  f("design/TOKENS.md", `# Tokens
| Token | Light | Use |
| --- | --- | --- |
| color/bg/canvas | #F6F7F9 | page background |
| color/bg/surface | #FFFFFF | cards, tables, dialogs |
| color/text/primary | #1F2328 | body text |
| color/text/secondary | #59636E | captions, metadata |
| color/action/primary | #1F5FD1 | primary buttons, links |
| color/status/success | #1A7F37 on #DAFBE1 | success tags |
| color/status/warning | #9A6700 on #FFF8C5 | warnings |
| color/status/critical | #CF222E on #FFEBE9 | errors |
| color/border | #D1D9E0 | dividers |

Type: 12 / 14 / 16 / 20 / 24 / 32, line height 1.4–1.5. Spacing: 4-pt scale (4, 8, 12, 16, 24, 32). Radius: 4 (inputs, buttons), 8 (cards).`),
  f("design/components/BUTTONS.md", `# Buttons
- Primary: filled action color. One per view.
- Secondary: outlined. Cancel, secondary actions.
- Tertiary / ghost: text only. Row actions in tables.
- Destructive actions open a confirmation that repeats what will be affected.
- Sizes: 32px (default), 40px (large). Minimum target 24×24px.`),
  f("design/components/DATA_TABLES.md", `# Data tables
- Header: 12px, uppercase, secondary text color.
- Rows: 14px, 48px tall, hover background.
- Numbers right-aligned with tabular figures; text left-aligned.
- Status column uses a Tag with words.
- Bulk selection bar shows the full count of selected rows.
- Empty state: one sentence plus the action that fixes it (for example "Clear filters").`),
  f("design/components/FEEDBACK.md", `# Feedback
- Notification (inline banner): severity icon + title + message + optional action. Errors use role="alert".
- Toast: short confirmation of a finished action; offer Undo where possible.
- Loading: skeleton rows for tables, never a blank screen.
- Errors explain what happened and how to fix it.`),
  f("tokens.json", JSON.stringify({ collection: "Example Design System", modes: { light: { "color/background/canvas": "#F6F7F9", "color/background/surface": "#FFFFFF", "color/text/primary": "#1F2328", "color/text/secondary": "#59636E", "color/brand/primary": "#1F5FD1", "color/status/success/bg": "#DAFBE1", "color/status/success/text": "#1A7F37", "color/status/warning/bg": "#FFF8C5", "color/status/warning/text": "#9A6700", "color/status/critical/bg": "#FFEBE9", "color/status/critical/text": "#CF222E", "color/border/default": "#D1D9E0" } } }, null, 2)),
];

const N = (name, sub) => ({ id: name.split(/\s+/)[0], name, pageName: sub ? "↳ " + name : name, sub: !!sub });
export const SAMPLE_JOURNEY = [
  { group: "Ready to build", nodes: [N("J0 - Get started"), N("J1 - Set up campaigns"), N("J1.2.1 - Campaign setup - Store Locator", true), N("J2 - Rewards"), N("J3 - Launch"), N("J4 - Results")] },
  { group: "Reference", nodes: [N("R1 - Reference & components")] },
];
export const SAMPLE_NODE = "J1.2.1 - Campaign setup - Store Locator";

export const MATRIX_STYLE_GUIDE = `Review notes board (placed to the right of the Figma frames)
1. Header "Review notes" + one-line intro naming the screens (Jx.x.x) and acceptance criteria (AC) each card affects.
2. Card "AC coverage": title, one-line summary (designed / documented only / missing), table AC | REQUIREMENT | SCREENS | STATUS with tags Designed (green), Documented only (grey), Missing (red).
3. Three columns: "Open questions (n)" orange top border; "Recommendations (n)" navy top border; "Accessibility concerns (n)" red top border.
4. Each card: eyebrow "OPEN QUESTION 1", status tag (Completed = green), bold title, body, "Answer:" line when resolved, last line lists affected screens and ACs.
5. Status is always written as a word, never color alone.`;
