/* Background jobs (Figma builds) that keep running while the user moves between screens and ADOs. */
const jobs = new Map();
const subs = new Set();
let version = 0;
const emit = () => { version++; subs.forEach((f) => f()); };

export const jobStore = {
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  snapshot() { return version; },
  all() { return [...jobs.values()]; },
  get(id) { return jobs.get(id) || null; },
  forPipeline(pid) { return [...jobs.values()].find((j) => j.pipelineId === pid && j.status === "running") || [...jobs.values()].reverse().find((j) => j.pipelineId === pid) || null; },
  running() { return [...jobs.values()].filter((j) => j.status === "running"); },
  start(job) { const j = { status: "running", steps: [], startedAt: Date.now(), abort: false, ...job }; jobs.set(j.id, j); emit(); return j; },
  update(id, patch) { const j = jobs.get(id); if (!j) return; Object.assign(j, typeof patch === "function" ? patch(j) : patch); emit(); },
  step(id, i, patch) { const j = jobs.get(id); if (!j) return; j.steps = j.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)); emit(); },
  stop(id) { const j = jobs.get(id); if (j && j.status === "running") { j.abort = true; j.stopping = true; emit(); } },
  clear(id) { jobs.delete(id); emit(); },
};
export const isRunning = (pid) => jobStore.running().some((j) => j.pipelineId === pid);
