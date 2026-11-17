# Changelog

## 1.4.0 · 2026-11-17

### Added
- Designer reference: Figma pages or links named in the designer comments (by link, journey id such as `J9.4`, or page title) are read on Sync and lead the design: their screen shell, components, variants and the full structure of up to 4 screens per page come before the SSOT and the other pages. Links to other files are read for structure (view access works).
- Generation is blocked until a Sync has read the pages the designer comments point to.

### Changed
- The AI now sees the content structure of several reference screens, not only the shell screen.


## 1.3.1 · 2026-11-17

### Fixed
- Designer comments now lead every step: the matrices also receive their images, the Figma screen plan and each batch of screens get them as top-priority decisions (with images), and the prototype's navigation follows them.


## 1.3.0 · 2026-11-10

### Added
- Team workspace: dashboard, pipeline list with filters, status, assignee, activity log, presence, admin-only product settings, per-person AI settings, workspace export/import.
- References panel: source of truth (also view-only files) + uploaded design system + target file, with Sync; learned screen structure (header, side navigation, breadcrumb, title, modals, side panels).
- Icons: buttons get icons matching their action, from the file's icon components or SVGs in the design-system package.
- Prototype that mirrors the generated Figma screens (recorded during generation, no extra Figma calls); "Record from Figma and build" for older pages.
- Desktop screens are 1080 px tall by default and grow only when content needs it.

### Fixed
- Screens missing header or side navigation; modals and side panels now drawn over the screen on a scrim.
- Reference reading: screens found by content in any naming, page ids, read errors shown.
- Review notes section is generated in Figma.
- Secondary buttons tinted / showing placeholder icons (state and sample icons copied from the reference instance).
- Figma call-limit errors when building the prototype.


## 1.2.0 · 2026-11-06

### Added
- Per-pipeline context: Figma target, source of truth, sitemap and node belong to each pipeline. PRD template and design system are shared only by pipelines with the same product name, which are also the only references for suggestions. Older single-workspace settings migrate automatically.
- Designer comments are a Markdown editor with images.
- Navigable prototype built from the generated Figma page: exported screens, real elements as hotspots, AI-wired navigation; download as `.zip` or single `.html`.

### Fixed
- Empty validation and drift matrices on long work items: the analysis now runs in two parts, step 3 can rebuild the matrices, and local rules fill them if the AI fails.
- AI answers cut off by the output limit are continued automatically.
- Figma builds now detect screens and components in any file (no naming convention needed) and clone the file's own screen shell, so designs use the file's design system.
- Figma connector limits: images exported in slices (48 KB per response) and code compacted and split (50,000 characters per call).

### Removed
- The AI-written and storyboard HTML prototypes, replaced by the Figma-based prototype.

## 1.1.0 · 2026-11-06

### Added
- **Designer comments** in Raw ADO ingestion: notes the analysis takes into account. They flow into the PRD and audit, suggestions, the master prompt, the PO review pack PDF, the Figma build and the prototype; conflicts with the ADO become PO questions. Editing them enables converting again.
- **Navigable HTML prototype** in step 4: one self-contained, offline HTML file of the journey for presentations and user tests. *Interactive* mode is written by the configured AI provider; *Quick storyboard* is built instantly without AI. Preview in place, full screen, download `.html` or copy. Runs in the background and is saved per pipeline.

### Changed
- Background jobs now have a kind (Figma build or prototype); only a running Figma build asks for confirmation before interrupting actions.

## 1.0.0

- First public template: ADO ingestion, structured PRD and audit, validation and drift matrices, prompt compiler, Figma draft page builder, history, provider-agnostic AI, design-system slots.
