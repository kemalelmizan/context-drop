#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "app/javascript/context_drop");
const outArgIdx = process.argv.indexOf("--out");
const outFile = outArgIdx !== -1 && process.argv[outArgIdx + 1]
  ? path.resolve(process.argv[outArgIdx + 1])
  : path.join(rootDir, "app/assets/javascripts/context_drop/context_drop.js");
const outDir = path.dirname(outFile);

const MODULE_ORDER = [
  "types.ts",
  "sanitizer.ts",
  "icons.ts",
  "markdown.ts",
  "styles.ts",
  "api-client.ts",
  "screenshot.ts",
  "element-picker.ts",
  "widget.ts",
  "index.ts"
];

function stripImportsAndExports(jsCode) {
  return jsCode
    // Remove multi-line or single-line ES import/re-export statements
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\*\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    // Strip export keywords while keeping declarations
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/^\s*export\s+(async\s+function|function|class|const|let|var)\s+/gm, "$1 ")
    .replace(/^\s*\/\/# sourceURL=.*$/gm, "");
}

const chunks = [];
for (const filename of MODULE_ORDER) {
  const filePath = path.join(srcDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing widget source module: ${filePath}`);
  }
  const tsSource = fs.readFileSync(filePath, "utf8");
  const strippedJs = stripTypeScriptTypes(tsSource, { mode: "strip", sourceUrl: filename });
  const cleanedJs = stripImportsAndExports(strippedJs).trim();
  if (cleanedJs.length > 0) {
    chunks.push(`  // --- Module: ${filename} ---\n  ${cleanedJs.split("\n").join("\n  ")}`);
  }
}

const banner = `/**
 * ContextDrop Browser Widget Bundle (v0.2.0)
 * Self-contained Custom Element (<context-drop-widget>) with Shadow DOM isolation.
 * Generated from app/javascript/context_drop/*.ts — DO NOT EDIT DIRECTLY.
 */
(function () {
  "use strict";

${chunks.join("\n\n")}
})();
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, banner, "utf8");
console.log(`Built ${path.relative(rootDir, outFile)} (${ Buffer.byteLength(banner, "utf8") } bytes)`);
