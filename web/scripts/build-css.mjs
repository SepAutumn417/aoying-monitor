// Tailwind CSS build that runs entirely in-process.
//
// `vite build` is the normal path, but on some Windows hosts the esbuild
// service cannot spawn a child process (Error: spawn EPERM), which makes
// Vite fail before it even loads its config. This script only needs the
// Tailwind JS API, so it works there; pair it with the esbuild CLI
// (`esbuild.exe src/main.tsx --bundle ...`) to produce a full dist.
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "@tailwindcss/node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(webRoot, "src");
const outFile = path.join(webRoot, "dist", "assets", "app.css");

const scanner = new Scanner({
  sources: [
    { base: srcRoot, pattern: "**/*", negated: false },
    { base: webRoot, pattern: "index.html", negated: false },
  ],
});
const candidates = new Set(scanner.scan());

// The Tailwind CLI normally runs Lightning CSS afterwards, which is what turns
// every `@theme` block into a real `:root,:host` custom-property block. Without
// that step the `@theme` at-rules stay in the output, browsers ignore them, and
// every `var(--color-*)` reference resolves to nothing (headings render black).
// `inline`/`reference` themes are build-time only and are dropped, matching the
// CLI output.
function lowerThemeBlocks(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@theme", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const brace = css.indexOf("{", at);
    const head = css.slice(at, brace);
    let depth = 0;
    let end = brace;
    for (; end < css.length; end += 1) {
      if (css[end] === "{") depth += 1;
      else if (css[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = css.slice(brace + 1, end);
    if (!/inline|reference/.test(head)) out += `:root,:host{${body}}`;
    i = end + 1;
  }
  return out;
}

const entry = fs.readFileSync(path.join(srcRoot, "styles.css"), "utf8");
const compiler = await compile(entry, { base: srcRoot, onDependency() {} });
const css = lowerThemeBlocks(compiler.build(candidates));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, css);
console.log(`wrote ${path.relative(webRoot, outFile)} (${css.length} bytes, ${candidates.size} candidates)`);
