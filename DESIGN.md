---
name: ContextDrop
description: Tactile instrument design system for the ContextDrop book-corner peel-to-pin launcher, floating feedback chatbox, local BYOK agentic coding sidebar, DOM layer picker, and triage dashboard.
colors:
  pin-vermilion: "#c2410c"
  pin-vermilion-deep: "#9a3412"
  pin-vermilion-soft: "#ffedd5"
  inspector-cobalt: "#1d4ed8"
  inspector-cobalt-deep: "#1e40af"
  inspector-cobalt-soft: "#dbeafe"
  obsidian-ink: "#111318"
  obsidian-hover: "#252a34"
  slate-ink: "#4b5262"
  subtle-ink: "#5c6478"
  cool-canvas: "#f1f5f9"
  cool-recessed: "#e2e8f0"
  warm-paper: "#faf9f6"
  recessed-stone: "#f1efea"
  elevated-white: "#ffffff"
  hairline-stone: "#cbd5e1"
  danger-crimson: "#b91c1c"
  danger-soft: "#fee2e2"
  success-emerald: "#15803d"
  success-soft: "#dcfce7"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
  micro:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  xs: "4px"
  sm: "6px"
  chip: "7px"
  row: "8px"
  md: "10px"
  card: "12px"
  bar: "14px"
  lg: "16px"
  pill: "9999px"
  pin: "11px 11px 11px 3px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-pin-selector:
    backgroundColor: "{colors.pin-vermilion}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.pin}"
    padding: "6px 10px"
  button-pin-selector-hover:
    backgroundColor: "{colors.pin-vermilion-deep}"
  button-primary:
    backgroundColor: "{colors.obsidian-ink}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
---

# Design System: ContextDrop

## Overview

**Creative North Star: "The Tactile Field Pin & Loupe"**

ContextDrop lives overlaid on arbitrary host Ruby on Rails applications. Because it must remain unmistakably distinct from whatever host page lies beneath it without creating visual noise, its aesthetic combines warm archival paper surfaces (`#faf9f6`) and deep obsidian ink (`#111318`) with two high-precision instrument accents: **Pin Vermilion** (`#c2410c`) for physical pin-drop affordances and **Inspector Cobalt** (`#1d4ed8`) for live DOM geometry and layer disambiguation.

Every control is compact, draggable, and responsive. When the user activates the top-left Pin selector, the chatbox collapses into a compact floating bar with live DOM breadcrumbs while a cursor-tracked pushpin and layer popover allow surgical disambiguation of overlapping and deeply nested HTML elements.

**Key Characteristics:**
- **Asymmetric Pushpin Silhouette:** Pin triggers and markers use a directional teardrop/corner radius (`11px 11px 11px 3px`) pointing toward the anchored coordinate.
- **Warm Paper over Arbitrary Grounds:** Warm alabaster (`#faf9f6`) and recessed stone (`#f1efea`) prevent the widget from blending into standard cold-white (`#ffffff`) or slate SaaS backgrounds.
- **Authored 1.75px Stroke Iconography:** All icons use inline SVG paths with `1.75px` stroke width and round caps/joins—never Unicode symbols or emoji stand-ins.
- **Tabular Measurement Numerals:** All bounding-box dimensions (`200×44`), layer counters (`2/5 layers`), and timestamps enforce `font-variant-numeric: tabular-nums`.

## Colors

The palette separates **actionable pin affordances** (warm vermilion) from **structural DOM inspection** (deep cobalt) against a high-contrast warm neutral shell.

### Primary
- **Pin Vermilion** (`#c2410c`): Reserved for the top-left chatbox Pin selector, the freely floating pin button, the cursor pin marker, and element pin badges.
- **Pin Vermilion Deep** (`#9a3412`): Hover and pressed state for pin controls, plus badge foreground text on **Pin Vermilion Soft** (`#ffedd5`).

### Secondary
- **Inspector Cobalt** (`#1d4ed8`): Active DOM bounding-box highlight frames, active pin-mode toggle state, focus rings, and selected layer stack rows.
- **Inspector Cobalt Deep** (`#1e40af`): Foreground text on **Inspector Cobalt Soft** (`#dbeafe`) for active DOM breadcrumb pills and screenshot chips.

### Neutral
- **Obsidian Ink** (`#111318`): Primary typography, floating pin dock shell, and primary send CTA (`>16:1` contrast against Warm Paper).
- **Slate Ink** (`#4b5262`): Secondary copy, placeholders, and dimension readouts (`7.2:1` contrast against Warm Paper; tinted toward cool ink rather than neutral gray).
- **Warm Paper** (`#faf9f6`): Primary chatbox and layer popover background.
- **Recessed Stone** (`#f1efea`): Chatbox header drag bar, context chip tray, and empty-state thread card.
- **Hairline Stone** (`#d6d3cd`): Structural 1px borders separating the floating shell from the host page.

### Named Rules
**The Two-Signal Accent Rule.** Pin Vermilion (`#c2410c`) means "pick or pin an element"; Inspector Cobalt (`#1d4ed8`) means "active DOM geometry or layer selection." Never swap them or use either for decorative backgrounds.

## Typography

**Title & Body Font:** System UI Sans (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`)
**Label/Mono Font:** System Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`)

**Character:** Zero-latency native system sans for conversational feedback paired with tabular monospace strictly reserved for CSS selectors, DOM ancestor paths, and pixel geometry.

### Hierarchy
- **Title** (`600`, `13px`, `1.35` line-height): Chatbox header title and layer popover header.
- **Body** (`400`, `13.5px`, `1.5` line-height): Chat thread messages, prompt textarea, and status feedback.
- **Label** (`600`, `11px`, `1.3` line-height): Monospace CSS selectors (`button#pay-btn`), breadcrumb pills, and `tabular-nums` bounding-box dimensions (`200×44`).

### Named Rules
**The Earned Monospace Rule.** Monospace type is used exclusively for DOM tag names, CSS selectors, ancestor paths, and pixel dimensions—never as a decorative voice for prose or buttons.

## Layout

The widget operates inside an isolated `<context-drop-widget>` Shadow DOM root anchored at `position: fixed; z-index: 2147483640`.
- **Four Coordinated Surface States:**
  1. **Flush Book-Corner Fold Launcher (`.cd-book-corner`):** Compact `38×38px` (`46×46px` on hover) folded archival paper dog-ear flush against any viewport corner (`top_left`, `top_right`, `bottom_left`, `bottom_right`) with a Warm Paper flap over a Pin Vermilion under-corner reveal. Clicking opens the active surface; dragging (`>6px` threshold) morphs the folded corner into the live `.cd-drag-pin` pushpin (`@keyframes cd-peel-to-pin`). Releasing over a host DOM element pins it directly, while releasing inside another `68×68px` viewport corner zone (`.cd-corner-snap-ghost`) snaps the book corner to that corner.
  2. **Draggable Chatbox Window (`.cd-composer` & `.cd-composer.is-smart-mode`):** `404px` wide in verbose `staging`/`dev` mode and a more compact `356px` wide in `production` smart mode (`calc(100vw - 20px)` on `<480px` viewports), organized vertically into Header Drag Bar (`9px 11px`), Scrollable Session Thread (`max-height: 230px`, hidden in `smart` mode when empty while context is attached), Pinned Context Tray (`max-height: 116px`), and Prompt Input Shell. Used as the default surface in deployed environments (`staging`, `production`) and available via the `Feedback` mode toggle locally.
  3. **Docked Local BYOK Agentic Sidebar (`.cd-agent-sidebar`):** Full-height (`100dvh`) Antigravity / VS Code-style coding sidebar active only in local `development` on loopback (`320px–680px` resizable width, `420px` default, dockable `left` or `right` with an optional Push Page Layout toggle). Contains a Top Header Bar (`Agent | Feedback` mode switcher, environment badge, Cross-Env Feedback Inbox toggle, BYOK Vault toggle, dock/layout controls), collapsible BYOK & Cross-Env Feedback drawers, scrollable Markdown + Tool Trace + Diff Approval conversation stream, Pinned Context Tray, and Prompt Input Shell.
  4. **Compact Pinning Bar (`.cd-compact-bar`):** `440px` wide horizontal bar active while pinning elements on the page, displaying the active Pin toggle, scrollable DOM ancestor breadcrumbs, layer Up/Down buttons, and Expand Chat button.

## Elevation & Depth

Because ContextDrop floats over arbitrary host interfaces, it uses multi-layered directional drop shadows with a `1px solid #d6d3cd` structural border so edges remain crisp over both light and dark host pages.

### Shadow Vocabulary
- **Floating Window Shadow** (`0 22px 44px -12px rgba(17, 19, 24, 0.22), 0 8px 18px -6px rgba(17, 19, 24, 0.10)`): Applied to the Chatbox window, Compact Pinning Bar, and Layer Stack Popover.
- **Docked Sidebar Shadow** (`-14px 0 36px -12px rgba(17, 19, 24, 0.16)` / `14px 0 36px -12px rgba(17, 19, 24, 0.16)`): Applied to the right- or left-docked Local Agentic Sidebar.
- **Book-Corner Flap Shadow** (`drop-shadow(-2px 3px 5px rgba(17, 19, 24, 0.24))`): Applied to the folded dog-ear corner SVG so it lifts cleanly off arbitrary light or dark host pages.

## Shapes

- **Book-Corner Dog-Ear Crease:** Diagonal SVG corner fold (`38×38px` resting, `46×46px` hover) rotated per docked corner (`0deg`, `90deg`, `-90deg`, `180deg`) with a quadratic Bezier paper curl revealing Pin Vermilion underneath.
- **Pin Silhouette (`11px 11px 11px 3px` / `9999px 9999px 9999px 4px`):** The sharp bottom-left corner visually echoes a physical pushpin point and anchors the top-left Pin selector button, peel-drag pin (`.cd-drag-pin`), and cursor pin marker.
- **Floating Shells (`16px` / `14px`):** Outer chatbox and compact bar containers (`0px` flush viewport edge on `.cd-agent-sidebar`).
- **Chips, Diff Cards & Layer Rows (`7px` / `8px` / `10px`):** Internal interactive items inside trays, drawers, diff cards, and popovers.

## Components

### Book-Corner Fold Launcher & Peel-to-Pin Morph (`.cd-book-corner` & `.cd-drag-pin`)
- **Shape:** Flush corner triangle (`38×38px`) that morphs into an asymmetric pushpin (`9999px 9999px 9999px 4px`) when dragged past `6px`.
- **Color Assignment:** Warm Paper (`#faf9f6`) folded flap over Pin Vermilion (`#c2410c`) corner reveal; morphing drag pin uses Pin Vermilion background with Warm Paper pushpin icon.
- **Behavior:** Clicking opens the Feedback Composer (or Docked Agentic Sidebar in local `development`). Dragging peels the corner into a live pushpin loupe over host DOM elements (`Release to pin`) or snaps the launcher to any other viewport corner. Accessible via keyboard (`Enter`/`Space` to open; `Shift+Enter` to start keyboard/scroll Pin Mode).

### Top-Left Pin Selector (`.cd-pin-corner-btn`)
- **Shape:** Asymmetric pin radius (`11px 11px 11px 3px`).
- **Color Assignment:** Pin Vermilion (`#c2410c`) background with Warm Paper (`#faf9f6`) text and icon; shifts to Inspector Cobalt (`#1d4ed8`) when Pin Mode is active.
- **Behavior:** Clicking starts Pin Mode and collapses the chatbox or sidebar into the Compact Pinning Bar so the host page stays unobstructed.

### Local Agentic Diff Approval Cards (`.cd-diff-card`)
- **Shape:** `10px` radius card inside `.cd-agent-sidebar` with Obsidian Ink monospace diff viewport and tabular line-count badges (`+N` in Success Emerald, `-N` in Danger Crimson).
- **Behavior:** Proposed code edits from the local agent are staged in memory without touching disk until the developer clicks **Apply Change** (or **Reject**), with 1-click **Revert** after applying.

### Layer & Hierarchy Disambiguation Popover (`[data-context-drop-ui="layer-popover"]`)
- **Shape:** `348px` floating card (`12px` radius) anchored near the clicked pin coordinate and clamped inside the viewport.
- **Structure:** Header with layer count and Up/Down step buttons, interactive DOM ancestor breadcrumb bar, scrollable candidate stack (`Topmost`, `Overlap`, `Child`, `Parent` badges with dimensions and text snippets), and footer with `Pin Selected` confirmation.

### Context Chips & Production Smart Context Cards (`.cd-chip` & `.cd-smart-card`)
- **Verbose Chips (`.cd-chip`):** Elevated White (`#ffffff`) background, `1px solid #d6d3cd` border, `7px` radius, monospace `<tag#id.class>` label. Hovering highlights the live DOM node on the host page (`[data-context-drop-ui="chip-preview"]`); includes an inline camera button to capture an element-cropped screenshot and a remove button.
- **Production Smart Context Cards (`.cd-smart-card`):** Used when `selection_mode === "smart"`. Merges the promoted UI component and its auto-captured surrounding-context screenshot into a single `10px` radius card (`48×36px` redacted thumbnail + `600` System UI Sans friendly component title such as `“Complete Order” button` + `Surrounding area included` caption + cascade remove button), strictly honoring the **Earned Monospace Rule** by never rendering CSS selectors or monospace text to non-technical production users.

## Do's and Don'ts

### Do:
- **Do** keep all widget styles strictly scoped inside the Shadow DOM (`WIDGET_SHADOW_STYLES`) or inline on `[data-context-drop-ui]` overlay elements so host application CSS is never mutated.
- **Do** intercept `pointerdown`, `mousedown`, `mouseup`, `click`, and `wheel` in the capture phase during Pin Mode so underlying host links, buttons, and scroll containers are not triggered accidentally.
- **Do** use the authored 1.75px stroke SVG icons from `icons.ts` for all actions.

### Don't:
- **Don't** use Unicode glyphs (`✕`, `×`, `📷`, `›`) or emojis as UI icons.
- **Don't** place kickers or eyebrows above headings inside the chatbox or dashboard.
- **Don't** allow selection or unredacted screenshot capture of elements matching `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `input[type="hidden"]`, or `[autocomplete^="cc-"]`.
