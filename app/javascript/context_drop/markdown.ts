/**
 * Safe, zero-dependency Markdown and unified-diff renderer for ContextDrop Agent responses.
 * Escapes all HTML entities before formatting inline code, bold text, lists, and code blocks.
 */

export function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(escapedLine: string): string {
  const codeTokens: string[] = [];
  const withCodePlaceholders = escapedLine.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code class="cd-md-code">${code}</code>`);
    return `\u0000CDCODE${idx}\u0000`;
  });

  const withBold = withCodePlaceholders.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return withBold.replace(/\u0000CDCODE(\d+)\u0000/g, (_m, idxStr) => {
    const idx = Number(idxStr);
    return codeTokens[idx] ?? "";
  });
}

export function renderSafeMarkdown(markdown: string): string {
  const source = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!source) return "";

  const fenceParts = source.split(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g);
  const htmlBlocks: string[] = [];

  for (let i = 0; i < fenceParts.length; i += 3) {
    const proseChunk = fenceParts[i] || "";
    if (proseChunk.trim().length > 0) {
      htmlBlocks.push(renderProseBlocks(proseChunk));
    }

    if (i + 2 < fenceParts.length) {
      const lang = escapeHtml((fenceParts[i + 1] || "").trim());
      const codeBody = escapeHtml((fenceParts[i + 2] || "").replace(/\n$/, ""));
      const langAttr = lang ? ` data-lang="${lang}"` : "";
      htmlBlocks.push(
        `<pre class="cd-md-pre"${langAttr}><code class="cd-md-code-block">${codeBody}</code></pre>`
      );
    }
  }

  return htmlBlocks.join("");
}

function renderProseBlocks(prose: string): string {
  const lines = prose.split("\n");
  const out: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listTag: "ul" | "ol" | null = null;

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    out.push(`<p class="cd-md-p">${paragraphLines.join("<br>")}</p>`);
    paragraphLines = [];
  };

  const flushList = (): void => {
    if (!listTag || listItems.length === 0) return;
    out.push(`<${listTag} class="cd-md-list">${listItems.join("")}</${listTag}>`);
    listItems = [];
    listTag = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      out.push(
        `<p class="cd-md-heading">${formatInlineMarkdown(escapeHtml(headingMatch[2]))}</p>`
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listTag && listTag !== "ul") flushList();
      listTag = "ul";
      listItems.push(`<li>${formatInlineMarkdown(escapeHtml(bulletMatch[1]))}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listTag && listTag !== "ol") flushList();
      listTag = "ol";
      listItems.push(`<li>${formatInlineMarkdown(escapeHtml(orderedMatch[1]))}</li>`);
      continue;
    }

    flushList();
    paragraphLines.push(formatInlineMarkdown(escapeHtml(trimmed)));
  }

  flushParagraph();
  flushList();
  return out.join("");
}

export function buildUnifiedDiffElement(doc: Document, diffText: string): HTMLDivElement {
  const container = doc.createElement("div");
  container.className = "cd-diff-lines";

  const lines = String(diffText || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }
    const row = doc.createElement("div");
    if (line.startsWith("@@")) {
      row.className = "cd-diff-line cd-diff-hunk";
    } else if (line.startsWith("+")) {
      row.className = "cd-diff-line cd-diff-add";
    } else if (line.startsWith("-")) {
      row.className = "cd-diff-line cd-diff-del";
    } else {
      row.className = "cd-diff-line cd-diff-ctx";
    }
    row.textContent = line.length > 0 ? line : " ";
    container.appendChild(row);
  }

  return container;
}
