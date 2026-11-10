#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const demoHtmlPath = path.join(rootDir, "demo/index.html");
const widgetBundlePath = path.join(rootDir, "app/assets/javascripts/context_drop/context_drop.js");

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const feedbacks = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/demo" || url.pathname === "/demo/index.html")) {
    const html = fs.readFileSync(demoHtmlPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/app/assets/javascripts/context_drop/context_drop.js" ||
      url.pathname === "/assets/context_drop.js" ||
      url.pathname === "/context_drop/assets/context_drop.js")
  ) {
    const js = fs.readFileSync(widgetBundlePath, "utf8");
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(js);
    return;
  }

  if (req.method === "GET" && url.pathname === "/context_drop/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", feedbacks_count: feedbacks.length }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/context_drop/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        enabled: true,
        position: "top_left",
        placeholder: "Describe what feels off with the pinned elements...",
        features: {
          element_selection: true,
          screenshot_capture: true,
          element_capture_padding: 16
        }
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/context_drop/feedback") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(raw || "{}");
        const payload = parsed.feedback || parsed;
        const record = {
          id: feedbacks.length + 1,
          status: "new",
          attachments_count: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
          element_references_count: Array.isArray(payload.element_references)
            ? payload.element_references.length
            : 0,
          created_at: new Date().toISOString(),
          payload
        };
        feedbacks.push(record);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(record));
      } catch (err) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(port, host, () => {
  console.log(`\nContextDrop Interactive Demo running at: http://${host}:${port}`);
  console.log(`Or open directly in your browser: file://${demoHtmlPath}\n`);
});

