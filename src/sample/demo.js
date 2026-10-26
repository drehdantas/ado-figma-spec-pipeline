/* Sample work item and its precomputed analysis (fictional). */
export const DEMO_ADO = {
  id: "ADO-48213",
  link: "https://dev.azure.com/your-org/your-project/_workitems/edit/48213",
  po: "Alex Morgan",
  title: "Store Locator – Market A (Campaign Hub)",
  raw: `Feature 48213: Store Locator – Market A (Campaign Hub)
Area: Admin Console / Campaign Hub
Product Owner: Alex Morgan

DESCRIPTION
Market A is launching consumer campaigns that point shoppers to participating stores. Store data in MA comes from the CRM (sales-force system) and is synced nightly, so MA users must not create or edit stores by hand. Market B already uses Store Locator with manually created stores. We need one Store Locator module that supports both synced and manual markets, adds a store status (Active / Inactive) so stores can be paused without deleting them, and lets the consumer app show only active stores closest to the shopper.

BUSINESS LOGIC
- Each market has a store source setting: synced (the CRM) or manual. MA = synced.
- Per-market field configuration decides which location fields (Retailer, State, District) are used.
- Status is owned by Admin Console and must survive every the CRM sync.
- Campaigns menu is renamed "Campaign Hub" for MA; Store Locator sits under it.
- MA has ~6,160 stores.

USER STORIES
- As an MA market admin, I want stores synced from the CRM to appear automatically, so that I don't maintain store data twice.
- As a campaign manager, I want to set a store to Inactive, so that shoppers are not sent to stores that are not participating.
- As a campaign manager, I want to manage store groups.
- As a market admin, I want to choose which location fields are shown for my market.
- As a shopper, I want to see the closest participating stores.
- As a campaign manager, I want to select many stores at once and delete them.

ACCEPTANCE CRITERIA
AC-01 Store source setting per market: synced or manual (MA is synced).
AC-02 Synced markets: no Add Store, no upload, no Add to store group, no Create Store Group, no field edits except status.
AC-03 Per-market field configuration for Retailer, State and District.
AC-04 Fields that are switched off are hidden from columns, filters and the store page.
AC-05 MB: Retailer and State off, District on.
AC-06 District is added to the store data model.
AC-07 Status is the first column of the store list and the store group list.
AC-08 Store status toggle in the store page footer, left of Cancel / Save; show a warning if the store is linked to a campaign.
AC-09 Store group status toggle in the edit modal, left of Cancel / Save; show a warning if the group is linked to a campaign.
AC-10 Inactive stores are excluded from the consumer map.
AC-11 Status is preserved across the CRM syncs.
AC-12 Both lists can be filtered by status.
AC-13 Select-all selects every row matching the filters; the bar shows the full count.
AC-14 A store can belong to several groups; the list and group filter reflect it.
AC-15 Store page is read-only except status (synced markets).
AC-16 Store groups are reached through the existing view selector; title, breadcrumb, filters and count follow.
AC-17 Group list columns: Status, Group Name, Store Count, Actions.
AC-18 Last sync time and record count shown (synced markets).
AC-19 A failed latest sync is shown on the screen in red.
AC-20 Campaigns renamed Campaign Hub for MA.
AC-21 Store Locator sits under Campaign Hub, with its breadcrumb.
AC-22 Status is available to all markets, not only synced ones.
AC-24 The app sends the user's location; the back end returns the closest stores.`,
};

const V = (ac, requirement, status, node, questions, recs) => ({ ac, requirement, status, node, questions, recs });

export const DEMO_ANALYSIS = {
  engine: "Demo analysis (precomputed)",
  generatedAt: "2026-10-20T14:40:00-03:00",
  prd: {
    "1": { status: "partial", content: "PRD Title: Admin Console / Store Locator MA_Draft_Oct_2026\nProduct Name: Admin Console – Campaign Hub\nVersion: 0.1 (generated from ADO-48213)\nDate Created: 20-10-2026\nAuthor: Alex Morgan (Product Owner)\nApprovers: not provided" },
    "1.1": { status: "missing", content: "" },
    "1.2": { status: "filled", content: "0.1 · 20/10/2026 · Initial draft generated from ADO-48213 · N/A · Alex Morgan · pending" },
    "2.1": { status: "filled", content: "Initiative Name: Store Locator – Market A\nOverview: One Store Locator module inside Campaign Hub that supports markets whose stores are synced from the CRM (MA) and markets that create stores by hand (MB). Stores and store groups get an Active/Inactive status so they can be paused without deletion, and the consumer app shows only active stores nearest the shopper.\nSector: Consumer\nMarkets: Market A (primary), Market B (existing)\nFunction: Commercial & Consumer" },
    "2.2": { status: "partial", content: "Qualitative: remove double maintenance of store data in MA, stop sending shoppers to non-participating stores, reuse one module across markets.\nQuantitative: not provided – the ADO gives store volume (~6,160 MA stores) but no effort, cost or conversion targets." },
    "2.3": { status: "partial", content: "MA consumer campaign launch requires a store locator. Market B precedent exists. No link to strategy documents or user research." },
    "2.4": { status: "partial", content: "Product Owner: Alex Morgan\nSponsor, engineering lead and design lead: not provided" },
    "3.1": { status: "filled", content: "MA stores live in the CRM. Without a sync, campaign teams would re-key ~6,160 stores and drift out of date. There is also no way to pause a store, so shoppers can be routed to stores that are not participating." },
    "3.2": { status: "partial", content: "Market B creates stores manually with Add Store and upload. There is no store status; removing a store from a campaign means deleting it. Pain points for MA are inferred, not documented." },
    "3.3": { status: "filled", content: "1. Single source of store data per market (synced or manual).\n2. Pause stores and groups without deleting them.\n3. Show shoppers only active, nearby stores.\n4. Reuse one module across MA, MB and future markets." },
    "3.4": { status: "filled", content: "In scope:\n1. Store source setting and per-market field configuration (AC-01–06)\n2. Store and store-group status, filters and warnings (AC-07–12, AC-22)\n3. Bulk selection across filtered results (AC-13)\n4. Read-only synced store page, sync status (AC-15, AC-18, AC-19)\n5. Campaign Hub naming and breadcrumb (AC-20, AC-21)\n6. Consumer-app closest-store lookup (AC-24)\nOut of scope:\n1. Editing the CRM data from Admin Console\n2. Consumer app UI (only the API contract)" },
    "3.5": { status: "partial", content: "the CRM sync runs nightly and returns stable store IDs. MA follows MB's field configuration (confirmed in review: Retailer and State off, District on)." },
    "3.6": { status: "missing", content: "" },
    "3.7": { status: "partial", content: "1. A the CRM sync that overwrites status (mitigated by AC-11).\n2. Bulk delete of up to 6,160 rows without confirmation.\n3. AC-23 missing from the work item – scope may be incomplete." },
    "4.1": { status: "partial", content: "MA market admin – configures market and checks sync health.\nCampaign manager – activates stores and groups for campaigns.\nShopper (consumer app) – finds the nearest participating store.\nNeeds are implied by the stories; no research cited." },
    "4.2": { status: "filled", content: "See the User Story & UX Readiness Audit tab (6 stories, 23 acceptance criteria)." },
    "4.3": { status: "filled", content: "Figma: Admin Console › Campaign Hub › J1.2.1 Store Locator MA\nCore flow: Campaign Hub › Store Locator › filter by status › open store › toggle status › warning if linked to campaign › Save." },
    "4.4": { status: "partial", content: "Journey node J1.2.1. Pain points: sync failures discovered late; no feedback when an inactive store is still in a live campaign." },
    "5.1": { status: "filled", content: "Built on an existing product: Admin Console (Campaign Hub / Store Locator, MB)." },
    "5.2": { status: "missing", content: "" },
    "5.3": { status: "partial", content: "Data Required: Store (ID, name, retailer, state, district, lat/long, status), Store Group, Market config.\nData Refresh: nightly the CRM sync.\nUser Access: synced markets read-only except status – role matrix not provided." },
    "6.1": { status: "missing", content: "" },
    "6.2": { status: "missing", content: "" },
    "6.3": { status: "filled", content: "See Open Questions in the Validation Matrix (8, 3 resolved)." },
    "6.4": { status: "partial", content: "Manual re-sync trigger; per-campaign store overrides; bulk status change with undo." },
    "7.1": { status: "filled", content: "MA – Market A · MB – Market B · CRM – customer relationship (sales-force) system, source of MA store data · SOT – Single Source of Truth Figma file · AC – Acceptance Criterion" },
    "7.2": { status: "partial", content: "ADO-48213. Product SOT (Figma). No research or technical spec links." },
  },
  stories: [
    { id: "US-1", text: "As an MA market admin, I want stores synced from the CRM to appear automatically, so that I don't maintain store data twice.", rating: "Strong", critique: "Clear persona, action and benefit. Backed by AC-01, AC-02, AC-18. Missing: what the admin does when the sync fails (AC-19 shows it but gives no next step)." },
    { id: "US-2", text: "As a campaign manager, I want to set a store to Inactive, so that shoppers are not sent to stores that are not participating.", rating: "Strong", critique: "Real problem, measurable outcome (AC-10). Clarify what happens to a live campaign when its store is deactivated (OQ-2)." },
    { id: "US-3", text: "As a campaign manager, I want to manage store groups.", rating: "Needs Clarification", critique: "No benefit clause and 'manage' is undefined. Does group status cascade to member stores? Can synced markets create groups at all (AC-02 says no)?" },
    { id: "US-4", text: "As a market admin, I want to choose which location fields are shown for my market.", rating: "Needs Clarification", critique: "Only MB's configuration is defined (AC-05). MA configuration, who may change it and what happens to existing data when a field is switched off are not stated." },
    { id: "US-5", text: "As a shopper, I want to see the closest participating stores.", rating: "Critical Gap", critique: "Consumer-app story inside a Admin Console feature. No behaviour when location permission is denied, when no store is within range, or how many stores are returned." },
    { id: "US-6", text: "As a campaign manager, I want to select many stores at once and delete them.", rating: "Critical Gap", critique: "Select-all can reach 6,160 rows with no confirmation, no undo and no rule for synced markets (where delete would be undone by the next sync). Benefit clause missing." },
  ],
  acs: null, // derived from validation rows
  ux: {
    verdict: "Partially sufficient",
    problem: "The work item explains the data problem (double maintenance, no pause state) well, but says little about the campaign manager's day: how they notice a sync failure, how they judge whether deactivating a store harms a running campaign, and what the shopper sees when nothing is nearby. The stories describe system behaviour more than user goals, so several screens had to be designed on assumptions.",
    gaps: [
      { category: "Bulk action", severity: "Critical Gap", title: "Bulk delete has no safeguard", detail: "AC-13 lets select-all reach every filtered row (up to 6,160). No confirmation, undo or limit is specified, and delete is meaningless in synced markets.", ask: "Can we require a confirmation that repeats the count, keep Export as the safe default action, and hide Delete in synced markets?" },
      { category: "Error state", severity: "Needs Clarification", title: "Sync failure has no recovery path", detail: "AC-19 shows a failed sync in red but gives the user nothing to do. Colour alone also fails WCAG 1.4.1.", ask: "Should users see the failure reason and a 'Retry sync' action, or a contact to the CRM team?" },
      { category: "Business rule", severity: "Needs Clarification", title: "Inactive store inside a live campaign", detail: "AC-08 warns when a store is linked to a campaign but doesn't say what happens after the user confirms.", ask: "Does the campaign keep running without that store, or is the change blocked until the campaign ends?" },
      { category: "Business rule", severity: "Needs Clarification", title: "Group status semantics", detail: "AC-09 adds a group status. It is not stated whether inactive groups deactivate their stores.", ask: "Group status affects group targeting only – member stores keep their own status. Confirm?" },
      { category: "Empty state", severity: "Needs Clarification", title: "No results and first-run states", detail: "Filters by status (AC-12) can return zero rows; a new synced market has zero stores until the first sync.", ask: "Approve copy for 'No stores match these filters' and 'Waiting for first the CRM sync'." },
      { category: "Edge case", severity: "Needs Clarification", title: "Location permission denied", detail: "AC-24 assumes the app always sends a location.", ask: "Fallback when location is denied: city picker, or full list sorted by name?" },
      { category: "Scope", severity: "Critical Gap", title: "AC-23 is missing", detail: "Numbering jumps from AC-22 to AC-24. Either a criterion was deleted or never written.", ask: "Was AC-23 removed on purpose? If not, what did it cover?" },
      { category: "Permissions", severity: "Needs Clarification", title: "Who can change status and field configuration", detail: "No role matrix. Field configuration (AC-03) is a market-wide setting that should not be open to every campaign manager.", ask: "Which roles can edit market configuration vs. store status?" },
    ],
  },
  validation: [
    V("AC-01", "Store source setting: synced or manual (MA is synced)", "Designed", "J1.2.1.1, J1.2.1.8, J1.2.1.9", "Who can change the source of an existing market?", "Show the source as a read-only label on the list header so users understand why actions are missing (Nielsen #1 visibility of system status)."),
    V("AC-02", "Synced: no Add Store, upload, Add to store group, Create Store Group or field edits except status", "Designed", "J1.2.1.1, J1.2.1.2, J1.2.1.5, J1.2.1.6, J1.2.1.9", "Can synced markets create store groups from synced stores? AC-02 and US-3 conflict.", "Hide unavailable actions rather than disable them; add an info line 'Stores are managed in the CRM'."),
    V("AC-03", "Per-market field configuration for Retailer, State and District", "Designed", "J1.2.1.9", "Which role owns this setting?", "Group the three switches under one 'Location fields' card with a preview of the resulting columns."),
    V("AC-04", "Fields that are off are hidden from columns, filters and the store page", "Designed", "J1.2.1.1, J1.2.1.4, J1.2.1.9", "Is hidden data kept or deleted when a field is switched off?", "Keep data; warn before switching a field off that has values."),
    V("AC-05", "MB: Retailer and State off, District on", "Designed", "J1.2.1.1, J1.2.1.4, J1.2.1.9", "Resolved: MA follows MB.", "Document MA = MB in the PRD assumptions."),
    V("AC-06", "District added to the store data model", "Documented / Dev Note Only - No Comp Needed", "J1.2.1.1, J1.2.1.4, J1.2.1.9", "Is District sourced from the CRM for MA?", "Dev note: nullable for manual markets."),
    V("AC-07", "Status is the first column of the store and group lists", "Designed", "J1.2.1.1, J1.2.1.5, J1.2.1.8", "—", "Status tags carry the words Active/Inactive; never color alone (WCAG 1.4.1)."),
    V("AC-08", "Store status toggle in the page footer, left of Cancel / Save; warning if linked to a campaign", "Designed", "J1.2.1.4, J1.2.1.12", "What happens to the running campaign after confirm? (OQ-2)", "Warning names the campaigns affected; switch exposes role=switch and aria-checked."),
    V("AC-09", "Store group status toggle in the edit modal, left of Cancel / Save; warning if linked to a campaign", "Designed", "J1.2.1.6, J1.2.1.13", "Does group status cascade to stores? (OQ-5 – No)", "Keep the switch label visible ('Group active') next to the control."),
    V("AC-10", "Inactive stores excluded from the consumer map", "Documented / Dev Note Only - No Comp Needed", "J1.2.1.10", "Is exclusion immediate or on next cache refresh?", "Dev note: state the refresh latency in the store page help text."),
    V("AC-11", "Status preserved across the CRM syncs", "Documented / Dev Note Only - No Comp Needed", "J1.2.1.10", "What if the CRM deletes a store that has a status? (OQ-3)", "Dev note: status stored in Admin Console, keyed by the CRM ID."),
    V("AC-12", "Both lists filterable by status", "Designed", "J1.2.1.1, J1.2.1.5, J1.2.1.8", "—", "Provide 'No stores match these filters' empty state with Clear filters."),
    V("AC-13", "Select-all covers every row matching the filters; bar shows the full count; delete confirmation repeats it", "Designed", "J1.2.1.2, J1.2.1.11", "Resolved: confirmation added (REC-1).", "Confirmation repeats the count; Export stays the safe default; no Delete in synced markets."),
    V("AC-14", "A store can belong to several groups; list and group filter reflect it", "Designed", "J1.2.1.1, J1.2.1.4", "Max groups shown in the cell before '+n'?", "Truncate to 2 group chips + '+n' with a tooltip listing all."),
    V("AC-15", "Store page read-only except status (synced markets)", "Designed", "J1.2.1.4", "—", "Use readonly (not disabled) fields so screen readers still read values; lock icon + 'Managed by the CRM'."),
    V("AC-16", "Store groups via the existing view selector; title, breadcrumb, filters, count follow", "Designed", "J1.2.1.5", "—", "Preserve filters when switching views (REC-5)."),
    V("AC-17", "Group list columns: Status, Group Name, Store Count, Actions", "Designed", "J1.2.1.5", "—", "Store Count right-aligned, tabular figures (DATA_TABLES.md)."),
    V("AC-18", "Last sync time and record count shown (synced markets)", "Designed", "J1.2.1.1, J1.2.1.5", "Timezone for the timestamp?", "Show relative + absolute time ('2 h ago · 20 Oct 06:00 local time')."),
    V("AC-19", "A failed latest sync is indicated on the screen", "Designed", "J1.2.1.3", "Is there a retry action or a support contact? (OQ-6)", "Red alone fails WCAG 1.4.1: pair icon + text 'Last sync failed', role=alert. Failure text on white measured 6.82:1."),
    V("AC-20", "Campaigns renamed Campaign Hub for MA", "Designed", "J1.2.1.7", "MA only, or all markets eventually?", "Rename via market config, not a hard-coded string."),
    V("AC-21", "Store Locator under Campaign Hub, with its breadcrumb", "Designed", "J1.2.1.1, J1.2.1.4, J1.2.1.7", "—", "Strict design system: breadcrumb sits on the canvas, outside the white content area."),
    V("AC-22", "Status available to all markets, not only synced ones", "Designed", "J1.2.1.8, J1.2.1.9", "Default status for existing MB stores?", "Migrate existing MB stores as Active."),
    V("AC-23", "Absent from the work item (PRD OQ-1)", "Blocked", "—", "Was AC-23 removed on purpose? If not, what did it cover?", "Hold sign-off until the PO confirms."),
    V("AC-24", "App sends the user's location; back end returns the closest stores", "Documented / Dev Note Only - No Comp Needed", "J1.2.1.10", "Fallback when location permission is denied? Result count / radius?", "Dev note: return only Active stores; define radius and max results."),
  ],
  driftColumns: { primary: "MA (Market A)", variantA: "MB (Market B)", variantB: "Market C" },
  drift: [
    { aspect: "Store data source", primary: "Synced nightly from the CRM", variantA: "Manual (Add Store, CSV upload)", variantB: "Manual – assumed, confirm", drift: "No Design system rule; local precedent is manual entry (MB).", rec: "Drive from market config: if source = synced → hide create/upload actions and show sync banner; else show them." },
    { aspect: "Create / upload / group actions", primary: "Hidden (AC-02)", variantA: "Visible", variantB: "Visible – assumed", drift: "Design system prefers hiding unavailable actions over disabled buttons; MB precedent shows them all.", rec: "Hide, and add one info line 'Stores are managed in the CRM' so the absence is explained." },
    { aspect: "Location fields", primary: "Retailer off, State off, District on", variantA: "Retailer off, State off, District on (AC-05)", variantB: "Retailer on, Region on, District off – assumed", drift: "Regional field naming (State vs Region vs District) is not in the design system.", rec: "Per-market field config (AC-03); columns, filters and store page read from the same config." },
    { aspect: "Store / group status", primary: "Active / Inactive, first column", variantA: "Added by AC-22 (new)", variantB: "Not defined", drift: "Design system status tags: success/neutral tokens with text; CC precedent used colored dots only.", rec: "Use Design system tags with words. Migrate existing MB stores as Active." },
    { aspect: "Sync health", primary: "Last sync time, count, failure banner", variantA: "N/A (manual)", variantB: "N/A", drift: "Design system System Alert Object needs severity, timestamp and Acknowledge action; AC-19 only asks for red text.", rec: "Render as System Alert Object for synced markets only: severity + timestamp + Acknowledge/Retry." },
    { aspect: "Breadcrumb placement", primary: "Campaign Hub › Store Locator", variantA: "Campaigns › Store Locator", variantB: "Not defined", drift: "Strict design system: breadcrumb on the canvas outside the white surface. CC precedent: inside the white card header.", rec: "Follow Strict design system for new screens; log the CC precedent as drift in the SOT." },
    { aspect: "Footer button hierarchy", primary: "Status switch · Cancel (secondary) · Save (primary)", variantA: "Cancel (ghost) · Save (primary)", variantB: "Not defined", drift: "Design system: one primary per view, secondary = outline. CC precedent uses ghost Cancel.", rec: "Status switch left-aligned, then outline Cancel, primary Save (AC-08, AC-09)." },
    { aspect: "Navigation label", primary: "Campaign Hub", variantA: "Campaigns", variantB: "Campaigns – assumed", drift: "Market-specific labels are not covered by the design system.", rec: "Label from market config (AC-20); keep route stable so links don't break." },
    { aspect: "Bulk actions", primary: "Select-all + Export; status change only", variantA: "Select-all + Export + Delete (with confirmation)", variantB: "Same as MB – assumed", drift: "Design system destructive actions need a confirmation dialog; MB precedent deletes immediately.", rec: "if source = synced → no Delete; else Delete requires dialog repeating the count (AC-13)." },
  ],
  reviewNotes: {
    summary: "20 designed, 3 documented only (no UI), 1 missing from the work item. Open question answers are now built in.",
    openQuestions: [
      { title: "MA field configuration", body: "AC-5 only defines MB (Retailer and State off, District on). The screens assume MA follows MB. Which of Retailer, State and District are on for MA?", answer: "Yes, MA follows MB.", affects: "J1.2.1.1, J1.2.1.4, J1.2.1.9 · AC-3, AC-5", done: true },
      { title: "Inactive store in a live campaign", body: "AC-8 warns when a store is linked to a campaign. What happens to the campaign once the user confirms?", answer: "The campaign keeps running; the store drops off the consumer map.", affects: "J1.2.1.4, J1.2.1.12 · AC-8, AC-10", done: true },
      { title: "Store removed in the CRM", body: "If the CRM deletes a store that is in a group or has a status, is it removed, archived or flagged?", answer: "", affects: "J1.2.1.10 · AC-11", done: false },
      { title: "AC-23 is missing", body: "Numbering jumps from AC-22 to AC-24. Was a criterion removed on purpose?", answer: "", affects: "— · AC-23", done: false },
      { title: "Group status cascade", body: "Does setting a group to Inactive also deactivate its stores?", answer: "No. Group status only affects group targeting.", affects: "J1.2.1.6, J1.2.1.13 · AC-9", done: true },
      { title: "Recovering from a failed sync", body: "AC-19 shows the failure but no next step. Can users retry, or should they contact the CRM team?", answer: "", affects: "J1.2.1.3 · AC-19", done: false },
      { title: "Location permission denied", body: "AC-24 assumes the app sends a location. What does the shopper see if permission is denied?", answer: "", affects: "J1.2.1.10 · AC-24", done: false },
      { title: "Export in synced markets", body: "Should exports include sync metadata (the CRM ID, last sync)?", answer: "", affects: "J1.2.1.2 · AC-13, AC-18", done: false },
    ],
    recommendations: [
      { title: "Confirm before bulk delete", body: "Select-all can reach 6,160 rows. Ask for confirmation that repeats the count, and keep Export selected as the safe action.", answer: "Agreed. Added to AC-13.", affects: "J1.2.1.2 · AC-13", done: true },
      { title: "Sync status as a persistent banner", body: "Show last sync and failures in a banner above the table, not a toast that disappears.", answer: "Agreed.", affects: "J1.2.1.1, J1.2.1.3 · AC-18, AC-19", done: true },
      { title: "Explain read-only fields", body: "Lock icon and 'Managed by the CRM' on synced fields, so users know where to edit.", answer: "Agreed.", affects: "J1.2.1.4 · AC-15", done: true },
      { title: "Label the status switch", body: "Keep the words Active / Inactive next to the switch; the switch alone is ambiguous.", answer: "Agreed.", affects: "J1.2.1.4, J1.2.1.6 · AC-8, AC-9", done: true },
      { title: "Keep filters across views", body: "Switching between Stores and Store groups should keep the status filter.", answer: "", affects: "J1.2.1.1, J1.2.1.5 · AC-12, AC-16", done: false },
      { title: "Empty states", body: "Add 'No stores match these filters' with Clear filters, and 'Waiting for first the CRM sync'.", answer: "Agreed.", affects: "J1.2.1.1, J1.2.1.5 · AC-12", done: true },
      { title: "Undo for status change", body: "Offer Undo in a 5-second toast after a status change instead of a second confirmation.", answer: "", affects: "J1.2.1.4 · AC-8", done: false },
      { title: "Breadcrumb outside the white area", body: "Follow Strict design system: breadcrumb on the canvas, above the white surface.", answer: "Agreed.", affects: "J1.2.1.7 · AC-21", done: true },
    ],
    accessibility: [
      { title: "Status must not rely on color", body: "Tags carry the words Active and Inactive, and the sync dot is paired with text. Measured in this file: 13.85:1 (Active), 13.21:1 (Inactive), 6.82:1 (failure text on white). Keep the words if tags are restyled.", answer: "", affects: "J1.2.1.1, J1.2.1.3", done: false },
      { title: "Switch name and state", body: "Status switches use role=switch, aria-checked and a visible label.", answer: "", affects: "J1.2.1.4, J1.2.1.6 · AC-8, AC-9", done: false },
      { title: "Announce sync failure", body: "The failure banner uses role=alert so screen readers hear it on load.", answer: "", affects: "J1.2.1.3 · AC-19", done: false },
      { title: "Select-all announces the count", body: "Accessible name 'Select all 6,160 stores', not just 'Select all'.", answer: "", affects: "J1.2.1.2 · AC-13", done: false },
      { title: "Focus return after dialogs", body: "Closing a warning or confirmation returns focus to the control that opened it.", answer: "", affects: "J1.2.1.11–13", done: false },
      { title: "Sortable headers", body: "Sortable columns expose aria-sort and are buttons inside the header cell.", answer: "", affects: "J1.2.1.1, J1.2.1.5", done: false },
      { title: "Read-only, not disabled", body: "Synced fields use readonly so values are read aloud and meet 4.5:1 contrast.", answer: "", affects: "J1.2.1.4 · AC-15", done: false },
      { title: "Dialog keyboard support", body: "Focus trap, Escape closes, destructive button labelled with the count ('Delete 6,160 stores').", answer: "", affects: "J1.2.1.11 · AC-13", done: false },
      { title: "Target size", body: "Row action buttons at least 24×24 px (WCAG 2.2, 2.5.8).", answer: "", affects: "J1.2.1.1, J1.2.1.5 · AC-17", done: false },
    ],
  },
};
