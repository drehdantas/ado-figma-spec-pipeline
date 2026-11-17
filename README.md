# ADO → Figma Spec Pipeline

Turn an Azure DevOps work item into everything a product designer needs before and after designing:

1. **Raw ADO ingestion** – paste the feature as Markdown (text, tables and screenshots), with Product Owner and stakeholders, plus **designer comments**: notes the analysis must take into account (context, decisions, research, constraints).
2. **Structured PRD & audit** – the work item mapped onto *your* PRD template, a readiness critique of every user story, the gaps to raise with the PO, and **suggested answers** for missing sections drawn from your earlier ADOs and from the AI acting as a UX designer. Export a PO review pack (copy or PDF).
3. **Validation & drift matrices** – an acceptance-criteria validation matrix, a market / design-system drift matrix and a review-notes board, all editable and exportable (Markdown / CSV).
4. **Prompt compiler & Figma** – one master prompt for any design or coding agent, a **one-click draft page in Figma** that follows how your file already builds screens, handoff and documentation, and a **navigable prototype that mirrors that Figma page** (one offline `.html`) for presentations and user tests.

Every work item is kept in a history list so the team can come back to it.

![Pipeline steps](docs/pipeline.svg)

---

## Run it

The app is a single HTML file. You can use it in two ways.

| | Claude artifact | Self-hosted page |
| --- | --- | --- |
| How | Publish `dist/artifact.html` as a Claude artifact | Serve `dist/index.html` (GitHub Pages, any static host, or open locally) |
| AI | Claude built in (your Claude account), or copy & paste with any agent | OpenAI-compatible, Anthropic, Gemini (your own key) or copy & paste |
| History & settings | Saved with the artifact (shared with whoever you share it with) | Saved in the browser (localStorage) |
| Images in ADOs | Stored as artifact assets | Stored with the work item |
| Build in Figma | Yes, through the Figma connector | Not directly: copy the master prompt into an agent that has the Figma MCP server |

### Build

```bash
npm install
npm run build        # writes dist/index.html and dist/artifact.html
npm run serve        # optional: preview dist/ locally
```

### GitHub Pages

The workflow in `.github/workflows/pages.yml` builds and deploys on every push to `main`. In the repository settings, set **Pages → Source** to **GitHub Actions**.

### As a Claude artifact

Publish `dist/artifact.html` as an artifact and grant these runtime capabilities:

| Capability | Why |
| --- | --- |
| `db` | Shared history of spec pipelines and workspace settings |
| `sample` (with images) | Claude analysis, suggestions and screen writing |
| `mcp` → server `Figma`, tool `use_figma` | Read the Figma file and build the draft page |
| `assets` | Screenshots pasted into ADOs |
| `downloads` | PDF, Markdown, CSV and design-system exports |

---

## Make it yours

Everything below is set in **Configuration & context** inside the app. Nothing is hard-coded to one company.

- **Product / platform name** – links pipelines. Each pipeline has its own context (Figma target, source of truth, sitemap, node); pipelines with the same product name share the PRD template, design-system slots and style guide, and only they are used as references for suggestions.
- **AI provider** – Automatic, Claude (built in), OpenAI-compatible (OpenAI, Azure OpenAI, OpenRouter, Ollama, LM Studio…), Anthropic, Gemini, or **Any agent (copy & paste)**. API keys stay in your browser and are never saved with the workspace.
- **PRD template** – upload your own `.docx`, `.md` or `.txt`; sections are detected from numbered headings (`2.1 Product Overview`). A neutral starter template is included.
- **Design system slots** – create as many slots as you need (for example “Brand 100% strict” and “Product hybrid”), upload any number of packages (`.zip` of Markdown/JSON, or single files) into each, choose how strictly each slot applies, and download a slot back as `.zip`. An example package lives in [`examples/design-system`](examples/design-system).
- **Figma target, source of truth and sitemap** – sync journey nodes (`J1`, `J1.2.1`, …) from your file's page list, or paste them.
- **Matrix style guide** – the format of the review-notes board.

### How “Build in Figma” works

1. **Read the file** (read-only): the page list, the selected journey page and a reference page you choose. It learns the screen shell, the library components in use, text styles, colour variables, the handoff card layout and the feature card.
2. **New page**: `↳ {node id} - {area} - {feature} [Draft]`, placed **below the selected journey node**, ordered by number among the node's existing sub-pages.
3. **Generate** (in the background): the AI plans 8–14 screens, then writes and builds them three at a time by cloning your shell and reusing your library components; a Handoff section and a Comparison section follow. You can keep working on other screens or ADOs while it runs; a header chip shows progress, and actions that would interrupt it ask for confirmation. Failed batches clean up after themselves and can be resumed.

Requires the Figma MCP server's `use_figma` tool (write access, beta): a Figma plan that includes it and edit access to the target file.

### Designer comments

A Markdown field (text and images) under the raw ADO. The notes go into the analysis, suggestions, the master prompt, the PO review pack PDF, the Figma build and the prototype; images are sent to the AI with the ADO's. Conflicts with the ADO are raised as PO questions. Editing the notes enables converting again.

### Figma references, icons and screen size

- **Designer reference** – name a page (`J9.4`, its title) or paste a Figma link in the designer comments: Sync reads it first and the design continues that work (same shell, components, variants and screen structure).
- **References** – the Figma panel syncs the target file and the source of truth (SSOT). The SSOT can be a file you only view: it is read with read-only metadata and used as a visual reference. The app learns the screen structure (top bars, side navigation, breadcrumb, title size, modals and side panels) from the existing screens, whatever their naming.
- **Design system** – the uploaded package is written guidance for the AI (tokens, component rules); colors, text styles and components in Figma come from the file's own variables, styles and library.
- **Icons** – each button gets an icon that matches its action: from the file's icon components first, then from SVG icons in the design-system package (`.svg` files in the `.zip`). Icons that can't be found are left out.
- **Components** start from their default state (no hover/pressed variants or sample icons copied from the reference).
- **Screen height** – desktop screens are 1080 px tall by default and grow only when their content needs more; side navigation and bottom bars follow.

### Navigable prototype from Figma

While the Figma page is generated, the app records what Figma actually drew on each screen (boxes, texts, fonts, colors, icons as SVG, modals; the header and navigation once) and the clickable elements. The prototype is rebuilt from that record, so it matches the Figma page, with zero extra Figma calls; one short AI call wires buttons, tabs, links and rows into the journey (simple rules if no AI is available). Pages generated earlier can be recorded once with **Record from Figma and build** (read-only). Download one offline `.html`. Keys: `←` `→` screens, `H` hotspots, `J` journey, `P` present.

### Team workspace

Shared pipelines with status (draft → PO review → approved → in design → handoff → done), assignee, activity log and presence; product settings editable by admins; AI settings per person; workspace export and import.

### Limits handled

- Long AI answers are continued automatically when they hit the output limit; the analysis runs in two parts (PRD & audit, then matrices).
- `use_figma` returns at most 48 KB and accepts at most 50,000 characters of code per call: reads and screen records are size-capped and split over calls, generated code is compacted, and Handoff / Review notes / Comparison are built over several calls.

---

## Project structure

```
src/
  app.jsx            App shell, history store, background jobs, AI bridge
  step1.jsx          Raw ADO ingestion (Markdown editor, stakeholders)
  steps23.jsx        Structured PRD & audit, suggestions, matrices, review board
  step4.jsx          Prompt compiler, the Figma panel and the prototype panel
  proto-snap.js      Records the drawn Figma screens and rebuilds them as HTML
  proto-render.js    Prototype file, navigation wiring, fallback renderer
  sot-reader.js      Read-only source-of-truth reading (view access)
  team.js, teamui.jsx, views.jsx  Team workspace: identity, status, activity, dashboard
  drawer.jsx         Configuration: AI, PRD template, design-system slots, Figma
  ai.js              Provider-agnostic AI layer
  engine.js          Analysis prompt, local rules engine, exports
  suggest.js         History-based and AI suggestions
  figma-*.js         Figma file reading, page building and the background runner
  jobs.js            Background job store
  store.js           Persistence (artifact database or localStorage)
  sample/            Neutral starter content: PRD template, example design system, demo work item
examples/design-system/   The example design-system package as files
scripts/build.mjs    Single-file build
```

## Privacy

- API keys: browser only (localStorage), never in the workspace data.
- Self-hosted: work items and settings stay in the browser unless you export them.
- Claude artifact: work items and settings are stored with the artifact and visible to the people you share it with.

## License

MIT
