const t = (n) => `rgb(var(--${n}) / <alpha-value>)`;
const names = ["bg","surface","surface-2","board","fg","muted","muted-strong","faint","line","accent","accent-strong","accent-fg","accent-soft","ok-bg","ok-fg","ok-dot","warn-bg","warn-fg","warn-dot","bad-bg","bad-fg","bad-line","neutral-bg","neutral-fg","scrim","code","code-fg","rn-orange","rn-navy","rn-red"];
export default {
  content: ["./src/**/*.{js,jsx}"],
  theme: { extend: {
    colors: Object.fromEntries(names.map((n) => [n, t(n)])),
    fontFamily: { sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"], mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"] },
  } },
  corePlugins: { preflight: true },
};
