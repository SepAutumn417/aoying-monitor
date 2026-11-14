// JS bundle build via the esbuild CLI binary.
//
// `vite build` is the normal path, but on this Windows host the esbuild
// service cannot spawn a child process (Error: spawn EPERM), so Vite fails
// before it loads its config. The CLI binary works, so bundle with it directly
// and pair it with scripts/build-css.mjs for the stylesheet.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(
  webRoot,
  "node_modules",
  "@esbuild",
  `${process.platform === "win32" ? "win32" : process.platform}-${process.arch}`,
  process.platform === "win32" ? "esbuild.exe" : "bin/esbuild",
);

const result = spawnSync(
  bin,
  [
    "src/main.tsx",
    "--bundle",
    "--format=esm",
    "--target=es2020",
    "--jsx=automatic",
    "--minify",
    // tailwindcss ships its entry point behind the "style" condition.
    "--conditions=style",
    "--define:process.env.NODE_ENV=\"production\"",
    '--define:import.meta.env={"MODE":"production","DEV":false,"PROD":true,"BASE_URL":"/"}',
    "--outfile=dist/assets/app.js",
    "--log-level=warning",
  ],
  { cwd: webRoot, stdio: "inherit" },
);

if (result.status !== 0) {
  console.error(`esbuild failed with status ${result.status}`);
  process.exit(result.status ?? 1);
}
console.log("wrote dist/assets/app.js");
