---
name: ContextDrop
description: Tactile instrument design system for the ContextDrop floating feedback chatbox, pin-drop DOM selector, and triage dashboard.
colors:
  pin-vermilion: "#c2410c"
  pin-vermilion-deep: "#9a3412"
  pin-vermilion-soft: "#ffedd5"
  inspector-cobalt: "#1d4ed8"
  inspector-cobalt-deep: "#1e40af"
  inspector-cobalt-soft: "#dbeafe"
  obsidian-ink: "#111318"
  slate-ink: "#4b5262"
  subtle-ink: "#5c6478"
  warm-paper: "#faf9f6"
  recessed-stone: "#f1efea"
  elevated-white: "#ffffff"
  hairline-stone: "#d6d3cd"
  danger-crimson: "#b91c1c"
  success-emerald: "#15803d"
typography:
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
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
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
- **Three Mutual States:**
  1. **Freely Floating Pin Dock (`.cd-pin-dock`):** Compact pill dock with drag grip, Pin button, and Chatbox toggle. Starts at `top_left` (or configured corner) and can be dragged anywhere within viewport bounds (`8px` margin clamp).
  2. **Draggable Chatbox Window (`.cd-composer`):** `400px` wide (`calc(100vw - 20px)` on `<480px` viewports), organized vertically into Header Drag Bar (`9px 11px`), Scrollable Session Thread (`max-height: 230px`), Pinned Context Tray (`max-height: 116px`), and Prompt Input Shell.
  3. **Compact Pinning Bar (`.cd-compact-bar`):** `440px` wide horizontal bar active while pinning elements on the page, displaying the active Pin toggle, scrollable DOM ancestor breadcrumbs, layer Up/Down buttons, and Expand Chat button.

## Elevation & Depth

Because ContextDrop floats over arbitrary host interfaces, it uses multi-layered directional drop shadows with a `1px solid #d6d3cd` structural border so edges remain crisp over both light and dark host pages.

### Shadow Vocabulary
- **Floating Window Shadow** (`0 22px 44px -12px rgba(17, 19, 24, 0.22), 0 8px 18px -6px rgba(17, 19, 24, 0.10)`): Applied to the Chatbox window, Compact Pinning Bar, and Layer Stack Popover.
- **Pin Dock Shadow** (`0 12px 24px -6px rgba(17, 19, 24, 0.24), 0 4px 10px -3px rgba(17, 19, 24, 0.12)`): Applied to the freely floating pin trigger dock.

## Shapes

- **Pin Silhouette (`11px 11px 11px 3px` / `9999px 9999px 9999px 4px`):** The sharp bottom-left corner visually echoes a physical pushpin point and anchors the top-left Pin selector button and cursor pin marker.
- **Floating Shells (`16px` / `14px`):** Outer chatbox and compact bar containers.
- **Chips & Layer Rows (`7px` / `8px`):** Internal interactive items inside trays and popovers.

## Components

### Top-Left Pin Selector (`.cd-pin-corner-btn` & `.cd-floating-pin-btn`)
- **Shape:** Asymmetric pin radius (`11px 11px 11px 3px`).
- **Color Assignment:** Pin Vermilion (`#c2410c`) background with Warm Paper (`#faf9f6`) text and icon; shifts to Inspector Cobalt (`#1d4ed8`) when Pin Mode is active.
- **Behavior:** Clicking starts Pin Mode and collapses the chatbox into the Compact Pinning Bar; dragging on `.cd-floating-pin-btn` repositions the dock freely.

### Layer & Hierarchy Disambiguation Popover (`[data-context-drop-ui="layer-popover"]`)
- **Shape:** `348px` floating card (`12px` radius) anchored near the clicked pin coordinate and clamped inside the viewport.
- **Structure:** Header with layer count and Up/Down step buttons, interactive DOM ancestor breadcrumb bar, scrollable candidate stack (`Topmost`, `Overlap`, `Child`, `Parent` badges with dimensions and text snippets), and footer with `Pin Selected` confirmation.

### Context Chips (`.cd-chip`)
- **Style:** Elevated White (`#ffffff`) background, `1px solid #d6d3cd` border, `7px` radius.
- **Behavior:** Hovering an element chip highlights the live DOM node on the host page (`[data-context-drop-ui="chip-preview"]`); includes an inline camera button to capture an element-cropped screenshot and a remove button.

## Do's and Don'ts

### Do:
- **Do** keep all widget styles strictly scoped inside the Shadow DOM (`WIDGET_SHADOW_STYLES`) or inline on `[data-context-drop-ui]` overlay elements so host application CSS is never mutated.
- **Do** intercept `pointerdown`, `mousedown`, `mouseup`, `click`, and `wheel` in the capture phase during Pin Mode so underlying host links, buttons, and scroll containers are not triggered accidentally.
- **Do** use the authored 1.75px stroke SVG icons from `icons.ts` for all actions.

### Don't:
- **Don't** use Unicode glyphs (`✕`, `×`, `📷`, `›`) or emojis as UI icons.
- **Don't** place kickers or eyebrows above headings inside the chatbox or dashboard.
- **Don't** allow selection or unredacted screenshot capture of elements matching `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `input[type="hidden"]`, or `[autocomplete^="cc-"]`.
