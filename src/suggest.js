/* Suggested answers for missing or partial PRD sections and open gaps.
   Two sources: earlier ADOs in this workspace's history, and the AI acting as a UX designer. */
import { mdForPrompt } from "./mdeditor.jsx";

const STOP = new Set("the a an and or of to in for on with is are be as by at from that this it its into not no can will should must when then than so we our your their they them have has was were all any each per via".split(" "));
const words = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9à-ÿ\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => { let i = 0; for (const w of a) if (b.has(w)) i++; return i / Math.max(1, a.size + b.size - i); };

/* Rank other pipelines by how close their work item is to this one. */
export function relatedPipelines(pipe, all) {
  const me = words(`${pipe.ado?.title} ${mdForPrompt(pipe.ado?.raw)}`);
  const stake = String(pipe.ado?.stakeholders || "").toLowerCase();
  return Object.values(all || {})
    .filter((p) => p.id !== pipe.id && p.res?.prd)
    .map((p) => {
      const sim = jaccard(me, words(`${p.ado?.title} ${mdForPrompt(p.ado?.raw)}`));
      let score = sim;
      if (pipe.ado?.po && p.ado?.po && pipe.ado.po.trim().toLowerCase() === p.ado.po.trim().toLowerCase()) score += 0.08;
      if (pipe.journeyNode && p.journeyNode && pipe.journeyNode.split(" ")[0].split(".")[0] === p.journeyNode.split(" ")[0].split(".")[0]) score += 0.05;
      if (stake && p.ado?.stakeholders && String(p.ado.stakeholders).toLowerCase().split(/[,;]/).some((s) => s.trim() && stake.includes(s.trim()))) score += 0.05;
      return { p, score, sim };
    })
    .filter((x) => x.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/* History suggestions for one PRD section: same section filled in a related ADO. */
export function historyForSection(sectionId, related) {
  return related
    .map(({ p, score, sim }) => ({ p, score, sim, v: p.res.prd[sectionId] }))
    .filter((x) => x.v && x.v.status !== "missing" && String(x.v.content || "").trim().length > 20)
    .slice(0, 2)
    .map(({ p, sim, v }) => ({ text: v.content, source: "history", from: `${p.ado?.id || "ADO"} · ${p.ado?.title || "Untitled"}`, match: Math.min(99, Math.round(sim * 100)) }));
}

export function suggestPrompt({ productName, pipe, res, sections, related }) {
  const gaps = sections.filter((s) => (res.prd[s.id]?.status || "missing") !== "filled");
  const hist = related.slice(0, 3).map(({ p }) => `--- ${p.ado?.id || "ADO"} · ${p.ado?.title}\n${gaps.map((s) => p.res.prd[s.id]?.content ? `${s.id} ${s.title}: ${String(p.res.prd[s.id].content).slice(0, 500)}` : "").filter(Boolean).join("\n")}`).join("\n");
  return `You are a senior UX designer and product analyst for ${productName}. A Product Owner wrote the work item below. Several PRD sections are missing or incomplete, and there are open questions.
Propose answers the team can review with the Product Owner. Draw on: (1) the work item itself, (2) how earlier, related work items in this workspace answered the same sections (below), (3) your own UX and product judgement. Never present a guess as a fact: say "Proposed:" for assumptions, keep numbers as ranges or "to confirm" unless the sources give them.

WORK ITEM (${pipe.ado?.id || "no id"} · PO ${pipe.ado?.po || "?"} · stakeholders ${pipe.ado?.stakeholders || "?"}):
"""
${mdForPrompt(pipe.ado?.raw).slice(0, 40000)}
"""

SECTIONS TO PROPOSE (id · title · what the template asks · current content):
${gaps.map((s) => `${s.id} · ${s.title} · ${s.guidance} · current: ${res.prd[s.id]?.content ? String(res.prd[s.id].content).slice(0, 300) : "(empty)"}`).join("\n")}

OPEN QUESTIONS FOR THE PO (index · question):
${res.ux.gaps.map((g, i) => `${i} · ${g.title}: ${g.ask}`).join("\n") || "(none)"}

RELATED WORK ITEMS FROM HISTORY:
${hist || "(none)"}

Return ONLY JSON: {"sections":{"<id>":{"text":"proposed section content","basis":"history | ux | work item | mixed","confidence":"high|medium|low"}},"gaps":[{"index":0,"answer":"proposed answer","confidence":"high|medium|low"}]}`;
}
