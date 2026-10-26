// Builds the app into two single-file outputs:
//   dist/index.html    – a standalone page (self-host it: GitHub Pages, any static host, or open locally)
//   dist/artifact.html – the same app as a fragment, ready to publish as a Claude artifact
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/app.jsx"], bundle: true, minify: true, format: "iife", jsx: "automatic",
  loader: { ".js": "jsx" }, define: { "process.env.NODE_ENV": '"production"' }, outfile: "dist/app.js", logLevel: "warning",
});
execFileSync(process.execPath, [require.resolve("tailwindcss/lib/cli.js"), "-i", "src/index.css", "-o", "dist/app.css", "--minify"], { stdio: "inherit" });

const js = readFileSync("dist/app.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync("dist/app.css", "utf8");
const body = `<title>ADO to Figma Spec Pipeline</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script>${js}</script>
`;
writeFileSync("dist/artifact.html", body);
writeFileSync("dist/index.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n${body}</body></html>\n`);
console.log(`dist/index.html and dist/artifact.html written (${Math.round(body.length / 1024)} KB)`);
