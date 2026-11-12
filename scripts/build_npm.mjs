#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

// 1. Clean previous dist/
fs.rmSync(distDir, { recursive: true, force: true });

// 2. Build the standalone IIFE browser bundle (used by Rails Engine & /bundle export)
execFileSync(process.execPath, [path.join(__dirname, "build_widget.mjs")], {
  cwd: rootDir,
  stdio: "inherit"
});

// 3. Compile ESM modules + TypeScript .d.ts declarations via tsc
const tscBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

execFileSync(tscBin, ["-p", "tsconfig.build.json"], {
  cwd: rootDir,
  stdio: "inherit"
});

// 4. Rewrite relative .ts import specifiers inside emitted .d.ts files to .js
// so consumers on all TypeScript 5.x+ / Next.js versions resolve declarations cleanly without .ts sources in dist/.
function rewriteDtsExtensions(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteDtsExtensions(fullPath);
    } else if (entry.name.endsWith(".d.ts")) {
      const original = fs.readFileSync(fullPath, "utf8");
      const updated = original
        .replace(/(from\s+["'])(\.\.?\/[^"']+)\.ts(["'])/g, "$1$2.js$3")
        .replace(/(import\(\s*["'])(\.\.?\/[^"']+)\.ts(["']\s*\))/g, "$1$2.js$3");
      if (updated !== original) {
        fs.writeFileSync(fullPath, updated, "utf8");
      }
    }
  }
}
rewriteDtsExtensions(distDir);

// 5. Verify "use client" directive is preserved at line 1 of React & Next client entrypoints
for (const relClientFile of ["dist/src/react/index.js", "dist/src/next/index.js"]) {
  const absFile = path.join(rootDir, relClientFile);
  const content = fs.readFileSync(absFile, "utf8");
  if (!content.startsWith('"use client";') && !content.startsWith("'use client';")) {
    fs.writeFileSync(absFile, `"use client";\n${content}`, "utf8");
  }
}

// 5. Ensure CLI binary has shebang and executable bit
const cliOutPath = path.join(rootDir, "dist/src/cli.js");
const cliContent = fs.readFileSync(cliOutPath, "utf8");
if (!cliContent.startsWith("#!/usr/bin/env node")) {
  fs.writeFileSync(cliOutPath, `#!/usr/bin/env node\n${cliContent}`, "utf8");
}
fs.chmodSync(cliOutPath, 0o755);

console.log("Built NPM package artifacts in dist/");
