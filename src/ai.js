/* One interface for any AI agent:
   - "claude"   : Claude, through the Claude artifact runtime (no key; uses the viewer's Claude account)
   - "openai"   : any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure OpenAI, OpenRouter, local LLM servers…)
   - "anthropic": Anthropic Messages API
   - "gemini"   : Google Gemini API
   - "manual"   : copy the prompt into any agent, paste its answer back
   API keys stay in this browser (localStorage) and are never saved with the workspace. */

export const PROVIDERS = {
  claude: { label: "Claude (built in)", note: "Runs on your Claude account when the app is opened as a Claude artifact." },
  openai: { label: "OpenAI-compatible API", note: "OpenAI, Azure OpenAI, OpenRouter, Ollama/LM Studio or any /chat/completions endpoint." },
  anthropic: { label: "Anthropic API", note: "Claude models through your own API key." },
  gemini: { label: "Google Gemini API", note: "Gemini models through your own API key." },
  manual: { label: "Any agent (copy & paste)", note: "Copy the prompt into ChatGPT, Copilot, Gemini, Claude Code or any agent, then paste the answer back." },
};

const KEY = (p) => `adoPipeline.key.${p}`;
export const getKey = (p) => { try { return localStorage.getItem(KEY(p)) || ""; } catch { return ""; } };
export const setKey = (p, v) => { try { v ? localStorage.setItem(KEY(p), v) : localStorage.removeItem(KEY(p)); } catch {} };

export function resolveProvider(aiCfg, caps) {
  const p = aiCfg?.provider || "auto";
  if (p !== "auto") return p;
  if (caps.sample) return "claude";
  for (const k of ["anthropic", "openai", "gemini"]) if (getKey(k)) return k;
  return "manual";
}

const blobToDataUrl = (b) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(b); });
const err = (code, message) => Object.assign(new Error(message), { code });
const need = (m, l) => { if (!m) throw err("config", `Set the ${l} model name in Configuration › AI provider.`); return m; };

async function post(url, headers, body, signal) {
  let res;
  try { res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal }); }
  catch (e) {
    if (e?.name === "AbortError") throw err("cancelled", "Stopped.");
    throw err("network", "Couldn't reach the AI service. Inside a Claude artifact, direct API calls are blocked: use Claude (built in) or Copy & paste, or run the app from your own server.");
  }
  const txt = await res.text();
  if (!res.ok) throw err(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limited" : "http", `AI service answered ${res.status}: ${txt.slice(0, 300)}`);
  try { return JSON.parse(txt); } catch { throw err("http", "The AI service returned something that isn't JSON."); }
}

/* Returns { ask(prompt, opts) → Promise<string>, provider, label, imageLimit() } */
export function makeAI({ aiCfg, caps, manualBridge }) {
  const provider = resolveProvider(aiCfg, caps);
  const label = PROVIDERS[provider]?.label || provider;
  const imageLimit = async () => {
    if (provider === "claude") { try { const l = await caps.sample.limits(); return l?.images?.maxCount || 0; } catch { return 0; } }
    if (provider === "manual") return 0;
    return 5;
  };
  async function ask(prompt, { images = [], onText, signal, tier = "complex", title } = {}) {
    if (provider === "claude") {
      if (!caps.sample) throw err("unavailable", "Claude isn't available in this view. Choose another AI provider in Configuration.");
      try {
        const { text } = await caps.sample(prompt, { modelTier: tier, signal, ...(images.length ? { images } : {}), onText: onText ? ({ text }) => onText(text) : undefined });
        return text;
      } catch (e) { throw err(e?.code || "error", e?.code === "not_granted" ? "Claude access was declined for this page." : e?.message || "Claude call failed."); }
    }
    if (provider === "manual") return manualBridge({ prompt, imageCount: images.length, title });
    const key = getKey(provider);
    if (!key && provider !== "openai") throw err("auth", `Add your ${label} key in Configuration › AI provider.`);
    onText?.("Waiting for " + label + "…");
    if (provider === "openai") {
      const c = aiCfg.openai || {};
      const content = images.length ? [{ type: "text", text: prompt }, ...(await Promise.all(images.map(async (b) => ({ type: "image_url", image_url: { url: await blobToDataUrl(b) } }))))] : prompt;
      const j = await post(`${(c.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, key ? { authorization: `Bearer ${key}` } : {}, { model: need(c.model, "OpenAI-compatible"), messages: [{ role: "user", content }] }, signal);
      return j.choices?.[0]?.message?.content || "";
    }
    if (provider === "anthropic") {
      const c = aiCfg.anthropic || {};
      const content = [...(await Promise.all(images.map(async (b) => { const d = await blobToDataUrl(b); return { type: "image", source: { type: "base64", media_type: d.slice(5, d.indexOf(";")), data: d.split(",")[1] } }; }))), { type: "text", text: prompt }];
      const j = await post("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, { model: c.model || "claude-sonnet-5-5", max_tokens: 16000, messages: [{ role: "user", content }] }, signal);
      return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    }
    if (provider === "gemini") {
      const c = aiCfg.gemini || {};
      const parts = [{ text: prompt }, ...(await Promise.all(images.map(async (b) => { const d = await blobToDataUrl(b); return { inline_data: { mime_type: d.slice(5, d.indexOf(";")), data: d.split(",")[1] } }; })))];
      const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(need(c.model, "Gemini"))}:generateContent?key=${encodeURIComponent(key)}`, {}, { contents: [{ role: "user", parts }] }, signal);
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    }
    throw err("unavailable", "Unknown AI provider.");
  }
  return { ask, provider, label, imageLimit };
}
