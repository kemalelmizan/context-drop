#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runContextDropMcpStdio } from "./mcp/index.ts";
import { createLocalStorageAdapter } from "./server/storage/local.ts";
import { createPostgresStorageAdapter, type PostgresQueryable } from "./server/storage/postgres.ts";
import { VERSION, type StorageAdapter } from "./server/types.ts";

export function loadEnvFilesIfPresent(cwd: string = process.cwd()): void {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(cwd, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const cleaned = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
        const eqIdx = cleaned.indexOf("=");
        if (eqIdx <= 0) continue;

        const key = cleaned.slice(0, eqIdx).trim();
        let val = cleaned.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch {
      // Non-fatal
    }
  }
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const prefix = `${flag}=`;
  const eqArg = args.find((a) => a.startsWith(prefix));
  return eqArg ? eqArg.slice(prefix.length) : undefined;
}

async function resolveCliStorage(args: string[]): Promise<StorageAdapter> {
  const pgUrl =
    getFlagValue(args, "--postgres") ||
    process.env.CONTEXT_DROP_DATABASE_URL ||
    undefined;

  if (pgUrl) {
    try {
      const hostRequire = createRequire(path.join(process.cwd(), "package.json"));
      const pgMod = hostRequire("pg") as {
        Pool: new (opts: { connectionString: string }) => PostgresQueryable;
      };
      const pool = new pgMod.Pool({ connectionString: pgUrl });
      return createPostgresStorageAdapter({ pool });
    } catch (err) {
      process.stderr.write(
        `[context-drop] Failed to load 'pg' for --postgres / CONTEXT_DROP_DATABASE_URL: ${(err as Error).message}\n`
      );
      process.exit(1);
    }
  }

  const storageDir = getFlagValue(args, "--dir") || process.env.CONTEXT_DROP_STORAGE_DIR;
  return createLocalStorageAdapter({ dir: storageDir });
}

function runInitCommand(args: string[], cwd: string = process.cwd()): void {
  const force = args.includes("--force");
  const routerOverride = getFlagValue(args, "--router");

  const hasSrcApp = fs.existsSync(path.join(cwd, "src", "app"));
  const hasApp = fs.existsSync(path.join(cwd, "app"));
  const hasSrcPages = fs.existsSync(path.join(cwd, "src", "pages"));
  const hasPages = fs.existsSync(path.join(cwd, "pages"));

  const usePagesRouter =
    routerOverride === "pages" ||
    (routerOverride !== "app" && !hasSrcApp && !hasApp && (hasSrcPages || hasPages));

  const isTypeScript =
    fs.existsSync(path.join(cwd, "tsconfig.json")) ||
    fs.existsSync(path.join(cwd, "next.config.ts"));
  const ext = isTypeScript ? "ts" : "js";

  if (usePagesRouter) {
    const basePagesDir = hasSrcPages ? path.join(cwd, "src", "pages") : path.join(cwd, "pages");
    const routeFile = path.join(basePagesDir, "api", "context-drop", `[[...path]].${ext}`);
    if (!fs.existsSync(routeFile) || force) {
      fs.mkdirSync(path.dirname(routeFile), { recursive: true });
      fs.writeFileSync(
        routeFile,
        [
          'import { createContextDropPagesHandler } from "context-drop/next/server";',
          "",
          "export const config = {",
          "  api: {",
          "    bodyParser: false",
          "  }",
          "};",
          "",
          "export default createContextDropPagesHandler({",
          "  mcp: {",
          "    enabled: Boolean(process.env.CONTEXT_DROP_MCP_API_KEY),",
          "    apiKey: process.env.CONTEXT_DROP_MCP_API_KEY",
          "  }",
          "});",
          ""
        ].join("\n"),
        "utf8"
      );
      process.stdout.write(`Created ${path.relative(cwd, routeFile)}\n`);
    } else {
      process.stdout.write(`Skipped ${path.relative(cwd, routeFile)} (already exists)\n`);
    }
  } else {
    const baseAppDir = hasSrcApp ? path.join(cwd, "src", "app") : path.join(cwd, "app");
    const routeFile = path.join(baseAppDir, "api", "context-drop", "[[...path]]", `route.${ext}`);
    if (!fs.existsSync(routeFile) || force) {
      fs.mkdirSync(path.dirname(routeFile), { recursive: true });
      fs.writeFileSync(
        routeFile,
        [
          'import { createContextDropNextHandler } from "context-drop/next/server";',
          "",
          "export const { GET, POST, OPTIONS } = createContextDropNextHandler({",
          "  mcp: {",
          "    enabled: Boolean(process.env.CONTEXT_DROP_MCP_API_KEY),",
          "    apiKey: process.env.CONTEXT_DROP_MCP_API_KEY",
          "  }",
          "});",
          ""
        ].join("\n"),
        "utf8"
      );
      process.stdout.write(`Created ${path.relative(cwd, routeFile)}\n`);
    } else {
      process.stdout.write(`Skipped ${path.relative(cwd, routeFile)} (already exists)\n`);
    }
  }

  const gitignoreFile = path.join(cwd, ".gitignore");
  if (fs.existsSync(gitignoreFile)) {
    const content = fs.readFileSync(gitignoreFile, "utf8");
    if (!content.includes(".context-drop")) {
      const prefix = content.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(gitignoreFile, `${prefix}.context-drop/\n`, "utf8");
      process.stdout.write("Added .context-drop/ to .gitignore\n");
    }
  }

  process.stdout.write(
    [
      "",
      "Next steps:",
      '1. Mount <ContextDrop /> in your root layout (e.g. app/layout.tsx):',
      '   import { ContextDrop } from "context-drop/next";',
      "   // Inside <body>:",
      "   <ContextDrop />",
      "",
      "2. Add the unified MCP server to your IDE (.mcp.json / Cursor / Claude Code / Antigravity):",
      '   { "mcpServers": { "context-drop": { "command": "npx", "args": ["context-drop", "mcp"] } } }',
      ""
    ].join("\n")
  );
}

function printHelp(): void {
  process.stdout.write(
    [
      `context-drop v${VERSION} — Self-hosted contextual feedback & unified MCP server`,
      "",
      "Usage:",
      "  npx context-drop mcp [options]     Start unified stdio MCP server (local + remote federation)",
      "  npx context-drop init [options]    Scaffold Next.js API route handler & .gitignore",
      "",
      "MCP Options:",
      "  --dir <path>          Local storage directory (default: .context-drop or CONTEXT_DROP_STORAGE_DIR)",
      "  --env <name>          Host environment name (default: CONTEXT_DROP_ENV / NODE_ENV / development)",
      "  --postgres <url>      Connect to PostgreSQL (requires 'pg' installed in host project)",
      "",
      "Init Options:",
      "  --router <app|pages>  Target Next.js App Router or Pages Router (auto-detected by default)",
      "  --force               Overwrite existing route handler file",
      ""
    ].join("\n")
  );
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cmd = argv[0];

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }

  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (cmd === "init") {
    runInitCommand(argv.slice(1));
    return;
  }

  if (cmd === "mcp") {
    loadEnvFilesIfPresent();
    const rest = argv.slice(1);
    const storage = await resolveCliStorage(rest);
    const hostEnvironment = getFlagValue(rest, "--env");
    await runContextDropMcpStdio({
      storage,
      hostEnvironment
    });
    return;
  }

  process.stderr.write(`Unknown command: ${cmd}\n\n`);
  printHelp();
  process.exit(1);
}

const isDirectEntry =
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") ||
    process.argv[1].endsWith("\\cli.js") ||
    process.argv[1].endsWith("/cli.ts") ||
    process.argv[1].endsWith("/context-drop"));

if (isDirectEntry) {
  void runCli();
}

