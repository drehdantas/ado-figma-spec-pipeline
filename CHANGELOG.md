# Changelog

## 1.1.0 · 2026-11-06

### Added
- **Designer comments** in Raw ADO ingestion: notes the analysis takes into account. They flow into the PRD and audit, suggestions, the master prompt, the PO review pack PDF, the Figma build and the prototype; conflicts with the ADO become PO questions. Editing them enables converting again.
- **Navigable HTML prototype** in step 4: one self-contained, offline HTML file of the journey for presentations and user tests. *Interactive* mode is written by the configured AI provider; *Quick storyboard* is built instantly without AI. Preview in place, full screen, download `.html` or copy. Runs in the background and is saved per pipeline.

### Changed
- Background jobs now have a kind (Figma build or prototype); only a running Figma build asks for confirmation before interrupting actions.

## 1.0.0

- First public template: ADO ingestion, structured PRD and audit, validation and drift matrices, prompt compiler, Figma draft page builder, history, provider-agnostic AI, design-system slots.
