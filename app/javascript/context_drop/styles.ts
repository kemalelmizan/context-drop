export const WIDGET_SHADOW_STYLES = `
:host {
  all: initial;
  --cd-ink: #111318;
  --cd-ink-secondary: #4b5262;
  --cd-ink-subtle: #525a6e;
  --cd-surface: #faf9f6;
  --cd-surface-recessed: #f1efea;
  --cd-surface-elevated: #ffffff;
  --cd-border: #d6d3cd;
  --cd-border-subtle: #e4e1da;
  --cd-pin: #c2410c;
  --cd-pin-hover: #9a3412;
  --cd-pin-soft: #ffedd5;
  --cd-accent: #1d4ed8;
  --cd-accent-hover: #1e40af;
  --cd-accent-soft: #dbeafe;
  --cd-danger: #b91c1c;
  --cd-danger-soft: #fee2e2;
  --cd-success: #15803d;
  --cd-success-soft: #dcfce7;
  --cd-shadow-float: 0 22px 44px -12px rgba(17, 19, 24, 0.22), 0 8px 18px -6px rgba(17, 19, 24, 0.10);
  --cd-shadow-pin: 0 12px 24px -6px rgba(17, 19, 24, 0.26), 0 4px 10px -3px rgba(17, 19, 24, 0.14);
  --cd-shadow-sidebar: -16px 0 38px -14px rgba(17, 19, 24, 0.16);
  --cd-radius-lg: 16px;
  --cd-radius-md: 10px;
  --cd-radius-sm: 6px;
  --cd-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --cd-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --cd-ease: cubic-bezier(0.22, 1, 0.36, 1);
  font-family: var(--cd-font);
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--cd-ink);
  caret-color: var(--cd-pin);
  z-index: 2147483640;
}

:host([data-theme="dark"]),
.cd-root[data-theme="dark"],
.cd-composer[data-theme="dark"],
.cd-agent-sidebar[data-theme="dark"],
.cd-compact-bar[data-theme="dark"] {
  --cd-ink: #f8fafc;
  --cd-ink-secondary: #94a3b8;
  --cd-ink-subtle: #64748b;
  --cd-surface: #0f1117;
  --cd-surface-recessed: #181b22;
  --cd-surface-elevated: #212631;
  --cd-border: #333947;
  --cd-border-subtle: #242935;
  --cd-pin: #ea580c;
  --cd-pin-hover: #f97316;
  --cd-pin-soft: rgba(234, 88, 12, 0.22);
  --cd-accent: #3b82f6;
  --cd-accent-hover: #60a5fa;
  --cd-accent-soft: rgba(59, 130, 246, 0.20);
  --cd-danger: #ef4444;
  --cd-danger-soft: rgba(239, 68, 68, 0.22);
  --cd-success: #22c55e;
  --cd-success-soft: rgba(34, 197, 94, 0.22);
  --cd-shadow-float: 0 24px 48px -12px rgba(0, 0, 0, 0.70), 0 8px 22px -6px rgba(0, 0, 0, 0.50);
  --cd-shadow-pin: 0 14px 28px -6px rgba(0, 0, 0, 0.65), 0 4px 12px -3px rgba(0, 0, 0, 0.45);
  --cd-shadow-sidebar: -16px 0 42px -10px rgba(0, 0, 0, 0.65);
}

:host([data-theme="dark"]) .cd-corner-flap,
.cd-root[data-theme="dark"] .cd-corner-flap {
  fill: #181b22;
  stroke: #333947;
}

:host([data-theme="dark"]) .cd-icon-btn:hover:not(:disabled),
.cd-agent-sidebar[data-theme="dark"] .cd-icon-btn:hover:not(:disabled),
.cd-composer[data-theme="dark"] .cd-icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.09);
  color: var(--cd-ink);
}

:host([data-theme="dark"]) .cd-starter-btn:hover,
.cd-agent-sidebar[data-theme="dark"] .cd-starter-btn:hover {
  background: #282f3d;
  border-color: var(--cd-accent);
}

:host([data-theme="dark"]) .cd-btn-primary:hover:not(:disabled),
.cd-agent-sidebar[data-theme="dark"] .cd-btn-primary:hover:not(:disabled),
.cd-composer[data-theme="dark"] .cd-btn-primary:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #e2e8f0;
}

:host([data-theme="dark"]) .cd-md-pre,
.cd-agent-sidebar[data-theme="dark"] .cd-md-pre,
.cd-composer[data-theme="dark"] .cd-md-pre {
  background: #090b0e;
  color: #e2e8f0;
  border-color: #242935;
}

:host([data-theme="dark"]) .cd-mode-btn.is-active,
.cd-agent-sidebar[data-theme="dark"] .cd-mode-btn.is-active,
.cd-composer[data-theme="dark"] .cd-mode-btn.is-active {
  background: #242935;
  color: #f8fafc;
  border-color: #3b4252;
}

*, *::before, *::after {
  box-sizing: border-box;
}

::selection {
  background: var(--cd-pin-soft);
  color: var(--cd-ink);
}

/* Focus states across all interactive controls */
button:focus-visible,
textarea:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 2px;
}

/* Custom themed scrollbars */
.cd-chat-thread::-webkit-scrollbar,
.cd-agent-stream::-webkit-scrollbar,
.cd-tray::-webkit-scrollbar,
.cd-diff-lines::-webkit-scrollbar,
.cd-feedbacks-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.cd-chat-thread::-webkit-scrollbar-track,
.cd-agent-stream::-webkit-scrollbar-track,
.cd-tray::-webkit-scrollbar-track,
.cd-diff-lines::-webkit-scrollbar-track,
.cd-feedbacks-list::-webkit-scrollbar-track {
  background: transparent;
}

.cd-chat-thread::-webkit-scrollbar-thumb,
.cd-agent-stream::-webkit-scrollbar-thumb,
.cd-tray::-webkit-scrollbar-thumb,
.cd-diff-lines::-webkit-scrollbar-thumb,
.cd-feedbacks-list::-webkit-scrollbar-thumb {
  background: var(--cd-border);
  border-radius: 9999px;
}

/* Floating Anchor Container for Composer & Compact Bar */
.cd-root {
  position: fixed;
  z-index: 2147483640;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  max-width: calc(100vw - 24px);
}

.cd-root.pos-top_left {
  top: 16px;
  left: 16px;
  align-items: flex-start;
}

.cd-root.pos-top_right {
  top: 16px;
  right: 16px;
  align-items: flex-end;
}

.cd-root.pos-bottom_left {
  bottom: 16px;
  left: 16px;
  align-items: flex-start;
}

.cd-root.pos-bottom_right {
  bottom: 16px;
  right: 16px;
  align-items: flex-end;
}

.cd-root.is-free-positioned {
  bottom: auto;
  right: auto;
  align-items: flex-start;
}

/* ==========================================================================
   1. BOOK-CORNER LAUNCHER & PEEL-TO-PIN MORPH
   ========================================================================== */

.cd-book-corner {
  appearance: none;
  position: fixed;
  z-index: 2147483641;
  width: 48px;
  height: 48px;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  transition: opacity 0.16s var(--cd-ease), transform 0.18s var(--cd-ease);
}

.cd-book-corner[hidden] {
  display: none !important;
}

.cd-book-corner:active {
  cursor: grabbing;
}

.cd-book-corner.corner-top_left {
  top: 0;
  left: 0;
}

.cd-book-corner.corner-top_right {
  top: 0;
  right: 0;
  justify-content: flex-end;
}

.cd-book-corner.corner-bottom_left {
  bottom: 0;
  left: 0;
  align-items: flex-end;
}

.cd-book-corner.corner-bottom_right {
  bottom: 0;
  right: 0;
  align-items: flex-end;
  justify-content: flex-end;
}

.cd-book-corner.is-peeled {
  opacity: 0;
  transform: scale(0.45);
  pointer-events: none;
}

.cd-book-corner-art {
  position: relative;
  width: 40px;
  height: 40px;
  display: block;
  transform-origin: top left;
  transition: transform 0.2s var(--cd-ease), filter 0.2s var(--cd-ease);
  filter: drop-shadow(0 3px 6px rgba(17, 19, 24, 0.20));
}

.cd-book-corner.corner-top_right .cd-book-corner-art {
  transform: scaleX(-1);
  transform-origin: center;
}

.cd-book-corner.corner-bottom_left .cd-book-corner-art {
  transform: scaleY(-1);
  transform-origin: center;
}

.cd-book-corner.corner-bottom_right .cd-book-corner-art {
  transform: scale(-1, -1);
  transform-origin: center;
}

.cd-book-corner:hover .cd-book-corner-art,
.cd-book-corner:focus-visible .cd-book-corner-art {
  filter: drop-shadow(0 6px 12px rgba(17, 19, 24, 0.28));
}

.cd-book-corner.corner-top_left:hover .cd-book-corner-art,
.cd-book-corner.corner-top_left:focus-visible .cd-book-corner-art {
  transform: scale(1.12);
}

.cd-book-corner.corner-top_right:hover .cd-book-corner-art,
.cd-book-corner.corner-top_right:focus-visible .cd-book-corner-art {
  transform: scale(-1.12, 1.12);
}

.cd-book-corner.corner-bottom_left:hover .cd-book-corner-art,
.cd-book-corner.corner-bottom_left:focus-visible .cd-book-corner-art {
  transform: scale(1.12, -1.12);
}

.cd-book-corner.corner-bottom_right:hover .cd-book-corner-art,
.cd-book-corner.corner-bottom_right:focus-visible .cd-book-corner-art {
  transform: scale(-1.12, -1.12);
}

.cd-book-corner-svg {
  display: block;
  width: 40px;
  height: 40px;
}

.cd-corner-flap {
  transition: transform 0.2s var(--cd-ease);
  transform-origin: 20px 20px;
}

.cd-book-corner:hover .cd-corner-flap,
.cd-book-corner:focus-visible .cd-corner-flap {
  transform: translate(1.5px, 1.5px);
}

/* Context count badge on Book Corner */
.cd-corner-count {
  position: absolute;
  z-index: 2;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9999px;
  background: var(--cd-ink);
  color: var(--cd-surface);
  border: 1.5px solid var(--cd-surface);
  font-family: var(--cd-font);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(17, 19, 24, 0.25);
}

.cd-book-corner.corner-top_left .cd-corner-count {
  top: 22px;
  left: 22px;
}

.cd-book-corner.corner-top_right .cd-corner-count {
  top: 22px;
  right: 22px;
}

.cd-book-corner.corner-bottom_left .cd-corner-count {
  bottom: 22px;
  left: 22px;
}

.cd-book-corner.corner-bottom_right .cd-corner-count {
  bottom: 22px;
  right: 22px;
}

/* Local Agent Mode Dot on Book Corner */
.cd-corner-agent-dot {
  position: absolute;
  z-index: 2;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--cd-accent);
  border: 1.5px solid var(--cd-surface);
}

.cd-book-corner.corner-top_left .cd-corner-agent-dot {
  top: 5px;
  left: 27px;
}

.cd-book-corner.corner-top_right .cd-corner-agent-dot {
  top: 5px;
  right: 27px;
}

.cd-book-corner.corner-bottom_left .cd-corner-agent-dot {
  bottom: 5px;
  left: 27px;
}

.cd-book-corner.corner-bottom_right .cd-corner-agent-dot {
  bottom: 5px;
  right: 27px;
}

/* Subtle hover micro-coach next to book corner */
.cd-corner-hint {
  position: absolute;
  pointer-events: none;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 7px;
  background: var(--cd-ink);
  color: var(--cd-surface);
  font-family: var(--cd-font);
  font-size: 11px;
  font-weight: 500;
  opacity: 0;
  box-shadow: 0 8px 18px -4px rgba(17, 19, 24, 0.28);
  transition: opacity 0.15s var(--cd-ease), transform 0.15s var(--cd-ease);
}

.cd-book-corner.corner-top_left .cd-corner-hint {
  top: 8px;
  left: 46px;
  transform: translateX(-4px);
}

.cd-book-corner.corner-top_right .cd-corner-hint {
  top: 8px;
  right: 46px;
  transform: translateX(4px);
}

.cd-book-corner.corner-bottom_left .cd-corner-hint {
  bottom: 8px;
  left: 46px;
  transform: translateX(-4px);
}

.cd-book-corner.corner-bottom_right .cd-corner-hint {
  bottom: 8px;
  right: 46px;
  transform: translateX(4px);
}

.cd-book-corner:hover .cd-corner-hint,
.cd-book-corner:focus-visible .cd-corner-hint {
  opacity: 1;
  transform: translateX(0);
}

/* Morphing Drag Pushpin (Book-Corner Peel -> Pushpin) */
@keyframes cd-peel-to-pin {
  0% {
    border-radius: 3px 14px 3px 3px;
    background: var(--cd-surface);
    color: var(--cd-pin);
    transform: translate3d(-4px, -10px, 0) rotate(-22deg) scale(0.76);
  }
  55% {
    border-radius: 18px 18px 18px 3px;
    background: var(--cd-pin);
    color: var(--cd-surface);
    transform: translate3d(-6px, -30px, 0) rotate(-6deg) scale(1.08);
  }
  100% {
    border-radius: 9999px 9999px 9999px 3px;
    background: var(--cd-pin);
    color: var(--cd-surface);
    transform: translate3d(-6px, -28px, 0) rotate(0deg) scale(1);
  }
}

.cd-drag-pin {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483647;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  will-change: transform;
}

.cd-drag-pin[hidden] {
  display: none !important;
}

.cd-drag-pin-head {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px 9999px 9999px 3px;
  background: var(--cd-pin);
  color: var(--cd-surface);
  border: 2px solid var(--cd-surface);
  box-shadow: var(--cd-shadow-pin);
  transform: translate3d(-6px, -28px, 0);
  animation: cd-peel-to-pin 0.22s var(--cd-ease) both;
  transition: background-color 0.14s var(--cd-ease), border-radius 0.16s var(--cd-ease), transform 0.14s var(--cd-ease);
}

.cd-drag-pin.has-target .cd-drag-pin-head {
  transform: translate3d(-6px, -30px, 0) rotate(-8deg) scale(1.06);
}

.cd-drag-pin.is-snapping-corner .cd-drag-pin-head {
  border-radius: 4px 14px 4px 4px;
  background: var(--cd-accent);
  transform: translate3d(-14px, -14px, 0) scale(0.94);
}

/* Corner Snap Target Ghost when re-docking Book Corner */
.cd-corner-snap-ghost {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  width: 52px;
  height: 52px;
  border: 2px dashed var(--cd-accent);
  background: rgba(29, 78, 216, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.14s var(--cd-ease), transform 0.14s var(--cd-ease);
}

.cd-corner-snap-ghost[hidden] {
  display: none !important;
}

.cd-corner-snap-ghost.corner-top_left {
  top: 0;
  left: 0;
  border-radius: 0 0 16px 0;
}

.cd-corner-snap-ghost.corner-top_right {
  top: 0;
  right: 0;
  border-radius: 0 0 0 16px;
}

.cd-corner-snap-ghost.corner-bottom_left {
  bottom: 0;
  left: 0;
  border-radius: 0 16px 0 0;
}

.cd-corner-snap-ghost.corner-bottom_right {
  bottom: 0;
  right: 0;
  border-radius: 16px 0 0 0;
}

/* ==========================================================================
   2. SHARED CONTROLS, BADGES & COMPACT PINNING COACH BAR
   ========================================================================== */

.cd-count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9999px;
  background: var(--cd-pin-soft);
  color: var(--cd-pin-hover);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cd-env-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 5px;
  font-family: var(--cd-mono);
  font-size: 10.5px;
  font-weight: 600;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  color: var(--cd-ink-secondary);
  flex-shrink: 0;
}

.cd-env-pill.is-local {
  background: var(--cd-accent-soft);
  border-color: rgba(29, 78, 216, 0.26);
  color: var(--cd-accent-hover);
}

.cd-mode-switch {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 8px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  gap: 2px;
  flex-shrink: 0;
}

.cd-mode-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--cd-ink-secondary);
  font-family: var(--cd-font);
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.14s var(--cd-ease), color 0.14s var(--cd-ease);
}

.cd-mode-btn:hover {
  color: var(--cd-ink);
}

.cd-mode-btn.is-active {
  background: var(--cd-ink);
  color: var(--cd-surface);
}

.cd-pin-dock-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 3px 4px 5px;
  color: var(--cd-ink-secondary);
  cursor: grab;
}

.cd-pin-dock-grip:active {
  cursor: grabbing;
}

.cd-compact-bar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  min-width: 390px;
  max-width: min(560px, calc(100vw - 24px));
  padding: 7px 10px;
  background: var(--cd-surface);
  color: var(--cd-ink);
  border: 1px solid var(--cd-border);
  border-radius: 14px;
  box-shadow: var(--cd-shadow-float);
  margin-bottom: 10px;
  user-select: none;
  touch-action: none;
}

.cd-compact-bar[hidden] {
  display: none !important;
}

.cd-compact-bar.is-smart-mode {
  min-width: 280px;
  padding: 6px 9px;
}

.cd-compact-status {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.cd-compact-coach-text {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--cd-ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cd-compact-coach-text strong {
  color: var(--cd-ink);
  font-weight: 600;
}

.cd-compact-wheel-icon {
  display: inline-flex;
  align-items: center;
  color: var(--cd-accent);
  flex-shrink: 0;
}

.cd-compact-pinned-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 5px 2px 6px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  border-radius: 7px;
  min-width: 0;
  max-width: 220px;
}

.cd-compact-pinned-count {
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cd-pin-soft);
  color: var(--cd-pin-hover);
  flex-shrink: 0;
}

.cd-compact-pinned-selector {
  font-family: var(--cd-mono);
  font-size: 11px;
  color: var(--cd-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-compact-step-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.cd-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--cd-mono);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.1;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border);
  color: var(--cd-ink-secondary);
}

.cd-btn-primary .cd-kbd {
  background: rgba(250, 249, 246, 0.16);
  border-color: rgba(250, 249, 246, 0.26);
  color: var(--cd-surface);
}

/* ==========================================================================
   3. FLOATING FEEDBACK CHATBOX COMPOSER (.cd-composer)
   ========================================================================== */

.cd-composer {
  pointer-events: auto;
  width: 404px;
  max-width: calc(100vw - 24px);
  background: var(--cd-surface);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius-lg);
  box-shadow: var(--cd-shadow-float);
  margin-bottom: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: opacity 0.18s var(--cd-ease), transform 0.18s var(--cd-ease);
}

.cd-composer[hidden] {
  display: none !important;
}

.cd-composer.is-smart-mode {
  width: 356px;
}

.cd-composer.is-smart-mode .cd-textarea {
  min-height: 60px;
}

.cd-composer.is-dragging-over,
.cd-agent-sidebar.is-dragging-over {
  border-color: var(--cd-accent);
}

.cd-composer-header,
.cd-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: var(--cd-surface-recessed);
  border-bottom: 1px solid var(--cd-border);
  user-select: none;
  flex-shrink: 0;
}

.cd-composer-header {
  cursor: grab;
  touch-action: none;
}

.cd-composer-header:active {
  cursor: grabbing;
}

.cd-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
}

.cd-sidebar-header .cd-header-left {
  flex: 0 0 auto;
  flex-shrink: 0;
}

.cd-sidebar-header .cd-composer-title {
  flex-shrink: 0;
  overflow: visible;
  text-overflow: clip;
}

.cd-pin-corner-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 11px 11px 11px 3px;
  border: 1px solid rgba(194, 65, 12, 0.25);
  background: var(--cd-pin);
  color: var(--cd-surface);
  font-family: var(--cd-font);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 10px -2px rgba(194, 65, 12, 0.26);
  transition: background-color 0.15s var(--cd-ease), transform 0.15s var(--cd-ease);
}

.cd-pin-corner-btn:hover {
  background: var(--cd-pin-hover);
  transform: translateY(-1px);
}

.cd-pin-corner-btn.is-active {
  background: var(--cd-accent);
  border-color: var(--cd-accent);
  box-shadow: 0 4px 10px -2px rgba(29, 78, 216, 0.30);
}

.cd-composer-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.cd-header-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.cd-icon-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--cd-ink-secondary);
  border-radius: 7px;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.cd-icon-btn:hover:not(:disabled) {
  background: rgba(17, 19, 24, 0.06);
  color: var(--cd-ink);
}

.cd-icon-btn.is-active {
  background: var(--cd-accent-soft);
  color: var(--cd-accent-hover);
  border-color: rgba(29, 78, 216, 0.25);
}

.cd-icon-btn:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

/* Conversational Chat Thread (Standard Feedback Mode) */
.cd-chat-thread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 230px;
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--cd-surface);
  scrollbar-width: thin;
}

.cd-chat-thread[hidden] {
  display: none !important;
}

.cd-composer.is-smart-mode .cd-chat-thread {
  padding: 10px 12px;
  max-height: 190px;
}

.cd-chat-empty {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border-subtle);
  border-radius: var(--cd-radius-md);
  color: var(--cd-ink-secondary);
  font-size: 12.5px;
}

.cd-chat-empty.is-smart {
  gap: 3px;
  padding: 8px 10px;
  font-size: 12px;
}

.cd-chat-empty-text {
  margin: 0;
  color: var(--cd-ink);
  font-weight: 600;
}

.cd-chat-empty-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--cd-ink-secondary);
}

.cd-chat-msg {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-self: flex-end;
  max-width: 92%;
  padding: 9px 11px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  border-radius: 12px 12px 3px 12px;
}

.cd-chat-msg-text {
  margin: 0;
  font-size: 13px;
  color: var(--cd-ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.cd-chat-msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--cd-ink-secondary);
  font-variant-numeric: tabular-nums;
}

.cd-chat-msg-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cd-chat-msg-pill {
  font-family: var(--cd-mono);
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border-subtle);
  color: var(--cd-ink);
}

.cd-chat-msg-pill.is-friendly {
  font-family: var(--cd-font);
  font-size: 11px;
  font-weight: 500;
}

/* ==========================================================================
   4. LOCAL BYOK AGENTIC CODING SIDEBAR (.cd-agent-sidebar)
   ========================================================================== */

.cd-agent-sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  height: 100dvh;
  width: var(--cd-sidebar-width, 560px);
  min-width: 360px;
  max-width: 100vw;
  z-index: 2147483642;
  pointer-events: auto;
  background: var(--cd-surface);
  display: flex;
  flex-direction: column;
  box-shadow: var(--cd-shadow-sidebar);
  transition: transform 0.2s var(--cd-ease), opacity 0.18s var(--cd-ease);
}

.cd-agent-sidebar[hidden] {
  display: none !important;
}

.cd-agent-sidebar.side-right {
  right: 0;
  border-left: 1px solid var(--cd-border);
}

.cd-agent-sidebar.side-left {
  left: 0;
  border-right: 1px solid var(--cd-border);
  box-shadow: 16px 0 38px -14px rgba(17, 19, 24, 0.16);
}

.cd-sidebar-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 4;
  touch-action: none;
  transition: background-color 0.14s ease;
}

.cd-agent-sidebar.side-right .cd-sidebar-resizer {
  left: -3px;
}

.cd-agent-sidebar.side-left .cd-sidebar-resizer {
  right: -3px;
}

.cd-sidebar-resizer:hover,
.cd-sidebar-resizer.is-resizing {
  background: rgba(29, 78, 216, 0.35);
}

/* Provider + BYOK Vault + Cross-Env Feedbacks Control Strip */
.cd-agent-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 11px;
  background: var(--cd-surface-elevated);
  border-bottom: 1px solid var(--cd-border-subtle);
  flex-wrap: wrap;
}

.cd-provider-pill-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 7px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface);
  color: var(--cd-ink);
  font-family: var(--cd-font);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  min-width: 0;
  max-width: 260px;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.cd-provider-pill-btn:hover {
  background: var(--cd-surface-recessed);
  border-color: var(--cd-ink-secondary);
}

.cd-key-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--cd-pin);
  flex-shrink: 0;
}

.cd-key-dot.is-ready {
  background: var(--cd-success);
}

.cd-provider-pill-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--cd-mono);
  font-size: 11px;
}

.cd-subbar-right {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* Inline Collapsible Drawers (BYOK Vault & Cross-Env Feedbacks) */
.cd-inline-drawer {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 12px;
  background: var(--cd-surface-recessed);
  border-bottom: 1px solid var(--cd-border);
}

.cd-inline-drawer[hidden] {
  display: none !important;
}

.cd-vault-security-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 7px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border-subtle);
  font-size: 11px;
  line-height: 1.35;
  color: var(--cd-ink-secondary);
}

.cd-vault-security-note svg {
  color: var(--cd-success);
  flex-shrink: 0;
  margin-top: 1px;
}

.cd-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cd-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cd-field.is-full {
  grid-column: 1 / -1;
}

.cd-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cd-ink-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.cd-key-source-badge {
  font-family: var(--cd-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cd-success-soft);
  color: var(--cd-success);
}

.cd-input,
.cd-select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface-elevated);
  color: var(--cd-ink);
  font-family: var(--cd-font);
  font-size: 12px;
}

.cd-input.is-mono {
  font-family: var(--cd-mono);
  font-size: 11.5px;
}

.cd-drawer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Cross-Environment Feedbacks Inbox Drawer */
.cd-env-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
}

.cd-env-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.cd-env-tab {
  appearance: none;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface-elevated);
  color: var(--cd-ink-secondary);
  font-family: var(--cd-mono);
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: 6px;
  cursor: pointer;
}

.cd-env-tab.is-active {
  background: var(--cd-ink);
  border-color: var(--cd-ink);
  color: var(--cd-surface);
}

.cd-feedbacks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 210px;
  overflow-y: auto;
}

.cd-feedback-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
}

.cd-feedback-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.cd-feedback-row-id {
  font-family: var(--cd-mono);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cd-accent-hover);
  font-variant-numeric: tabular-nums;
}

.cd-feedback-row-msg {
  margin: 0;
  font-size: 12px;
  color: var(--cd-ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Agent Conversation Stream */
.cd-agent-stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--cd-surface);
  scrollbar-width: thin;
}

.cd-agent-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border-subtle);
  border-radius: var(--cd-radius-md);
}

.cd-agent-empty-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cd-ink);
}

.cd-agent-empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--cd-ink-secondary);
}

.cd-starter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cd-starter-btn {
  appearance: none;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface-elevated);
  color: var(--cd-ink);
  font-family: var(--cd-font);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}

.cd-starter-btn:hover {
  border-color: var(--cd-accent);
  background: var(--cd-surface-elevated);
}

.cd-agent-msg {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-width: 100%;
}

.cd-agent-msg.is-user {
  align-self: flex-end;
  max-width: 92%;
  padding: 9px 11px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  border-radius: 12px 12px 3px 12px;
}

.cd-agent-msg.is-assistant {
  align-self: stretch;
  padding: 10px 12px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border-subtle);
  border-radius: 12px 12px 12px 3px;
}

/* Tool Call Trace Rows */
.cd-tool-traces {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--cd-border-subtle);
}

.cd-tool-trace {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--cd-ink-secondary);
}

.cd-tool-trace-badge {
  font-family: var(--cd-mono);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  color: var(--cd-ink);
  flex-shrink: 0;
}

.cd-tool-trace.is-error .cd-tool-trace-badge {
  background: var(--cd-danger-soft);
  border-color: rgba(185, 28, 28, 0.25);
  color: var(--cd-danger);
}

.cd-tool-trace-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Formatted Safe Markdown Body */
.cd-md-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cd-ink);
  word-break: break-word;
}

.cd-md-p {
  margin: 0;
}

.cd-md-heading {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}

.cd-md-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cd-md-code {
  font-family: var(--cd-mono);
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  color: var(--cd-ink);
}

.cd-md-pre {
  margin: 0;
  padding: 9px 10px;
  border-radius: var(--cd-radius-sm);
  background: var(--cd-ink);
  color: var(--cd-surface);
  overflow-x: auto;
  border: 1px solid rgba(17, 19, 24, 0.2);
}

.cd-md-code-block {
  font-family: var(--cd-mono);
  font-size: 11.5px;
  line-height: 1.45;
  white-space: pre;
}

/* Proposed File Edit Diff Cards */
.cd-diff-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface-elevated);
  overflow: hidden;
  margin-top: 4px;
}

.cd-diff-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  background: var(--cd-surface);
  border-bottom: 1px solid var(--cd-border-subtle);
}

.cd-diff-path-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.cd-diff-path {
  font-family: var(--cd-mono);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cd-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-diff-stats {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--cd-mono);
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.cd-diff-stat-add {
  color: var(--cd-success);
}

.cd-diff-stat-del {
  color: var(--cd-danger);
}

.cd-diff-summary {
  padding: 5px 10px;
  font-size: 11.5px;
  color: var(--cd-ink-secondary);
  border-bottom: 1px solid var(--cd-border-subtle);
}

.cd-diff-lines {
  font-family: var(--cd-mono);
  font-size: 11px;
  line-height: 1.45;
  max-height: 210px;
  overflow: auto;
  background: var(--cd-surface);
  padding: 4px 0;
}

.cd-diff-line {
  padding: 0 10px;
  white-space: pre;
}

.cd-diff-hunk {
  color: var(--cd-accent-hover);
  background: rgba(29, 78, 216, 0.07);
  font-weight: 600;
}

.cd-diff-add {
  background: var(--cd-success-soft);
  color: var(--cd-success);
}

.cd-diff-del {
  background: var(--cd-danger-soft);
  color: var(--cd-danger);
}

.cd-diff-ctx {
  color: var(--cd-ink-secondary);
}

.cd-diff-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  background: var(--cd-surface);
  border-top: 1px solid var(--cd-border-subtle);
}

.cd-diff-status-pill {
  font-size: 11px;
  font-weight: 600;
  color: var(--cd-ink-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cd-diff-status-pill.is-applied {
  color: var(--cd-success);
}

.cd-diff-status-pill.is-rejected {
  color: var(--cd-danger);
}

.cd-diff-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cd-btn-apply {
  background: var(--cd-success);
  border-color: var(--cd-success);
  color: var(--cd-surface-elevated);
  font-weight: 600;
}

.cd-btn-apply:hover:not(:disabled) {
  background: var(--cd-ink);
  border-color: var(--cd-ink);
}

.cd-btn-danger-outline {
  color: var(--cd-danger);
  border-color: rgba(185, 28, 28, 0.32);
}

.cd-btn-danger-outline:hover:not(:disabled) {
  background: var(--cd-danger-soft);
  border-color: var(--cd-danger);
}

/* Loading Skeleton in Agent Stream */
@keyframes cd-shimmer {
  0% { opacity: 0.45; }
  50% { opacity: 0.9; }
  100% { opacity: 0.45; }
}

.cd-agent-thinking {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border-subtle);
}

.cd-thinking-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cd-ink-secondary);
}

.cd-skeleton-bar {
  height: 8px;
  border-radius: 9999px;
  background: var(--cd-border);
  animation: cd-shimmer 1.3s ease-in-out infinite;
}

.cd-skeleton-bar.is-short {
  width: 62%;
}

/* ==========================================================================
   5. SHARED CONTEXT TRAY, STATUS BANNER & PROMPT SHELL
   ========================================================================== */

.cd-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 116px;
  overflow-y: auto;
  padding: 8px 12px;
  background: var(--cd-surface-recessed);
  border-top: 1px solid var(--cd-border-subtle);
  scrollbar-width: thin;
}

.cd-tray:empty {
  display: none;
}

/* Merged Smart Component + Surrounding Context Card (Production Smart Mode) */
.cd-smart-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  border-radius: 10px;
  transition: border-color 0.14s var(--cd-ease);
}

.cd-smart-card:hover {
  border-color: var(--cd-pin);
}

.cd-smart-card-thumb {
  width: 52px;
  height: 38px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface-recessed);
  flex-shrink: 0;
}

.cd-smart-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  background: var(--cd-pin-soft);
  color: var(--cd-pin-hover);
  flex-shrink: 0;
}

.cd-smart-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cd-smart-card-title {
  font-family: var(--cd-font);
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-smart-card-sub {
  font-family: var(--cd-font);
  font-size: 11px;
  color: var(--cd-ink-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 7px;
  background: var(--cd-surface-elevated);
  border: 1px solid var(--cd-border);
  border-radius: 7px;
  font-size: 11.5px;
  color: var(--cd-ink);
  transition: border-color 0.12s ease;
}

.cd-chip[data-chip-type="element"]:hover {
  border-color: var(--cd-pin);
}

.cd-chip-thumb {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--cd-border);
}

.cd-chip-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cd-pin-soft);
  color: var(--cd-pin-hover);
}

.cd-chip[data-chip-type="screenshot"] .cd-chip-badge,
.cd-chip[data-chip-type="image"] .cd-chip-badge {
  background: var(--cd-accent-soft);
  color: var(--cd-accent-hover);
}

.cd-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 165px;
  font-family: var(--cd-mono);
  font-size: 11px;
}

.cd-chip-action,
.cd-chip-remove {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--cd-ink-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  line-height: 1;
}

.cd-chip-action:hover {
  color: var(--cd-accent);
  background: var(--cd-accent-soft);
}

.cd-chip-remove:hover {
  color: var(--cd-danger);
  background: var(--cd-danger-soft);
}

/* Status Banner */
.cd-status {
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  border-top: 1px solid var(--cd-border-subtle);
}

.cd-status[hidden] {
  display: none !important;
}

.cd-status.error {
  color: var(--cd-danger);
  background: var(--cd-danger-soft);
}

.cd-status.success {
  color: var(--cd-success);
  background: var(--cd-success-soft);
}

/* Chatbox Prompt Input Container */
.cd-prompt-shell {
  display: flex;
  flex-direction: column;
  background: var(--cd-surface-elevated);
  border-top: 1px solid var(--cd-border);
}

.cd-textarea {
  width: 100%;
  min-height: 68px;
  max-height: 180px;
  resize: vertical;
  border: 0;
  padding: 10px 13px 6px;
  font-family: var(--cd-font);
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--cd-ink);
  background: transparent;
}

.cd-textarea::placeholder {
  color: var(--cd-ink-secondary);
}

.cd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px 9px;
  background: var(--cd-surface-elevated);
}

.cd-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.cd-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface);
  color: var(--cd-ink);
  font-family: var(--cd-font);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.cd-btn:hover:not(:disabled) {
  background: var(--cd-surface-recessed);
  border-color: var(--cd-ink-secondary);
}

.cd-btn.is-active {
  background: var(--cd-accent-soft);
  border-color: rgba(29, 78, 216, 0.35);
  color: var(--cd-accent-hover);
}

.cd-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cd-btn-primary {
  background: var(--cd-ink);
  border-color: var(--cd-ink);
  color: var(--cd-surface);
  font-weight: 600;
  padding: 6px 12px;
}

.cd-btn-primary:hover:not(:disabled) {
  background: #252a34;
  border-color: #252a34;
}

@media (max-width: 560px) {
  .cd-composer,
  .cd-compact-bar {
    width: calc(100vw - 20px);
    min-width: 0;
  }

  .cd-compact-bar {
    flex-wrap: wrap;
  }

  .cd-agent-sidebar {
    width: 100vw !important;
    min-width: 0;
  }

  .cd-form-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd-book-corner,
  .cd-book-corner-art,
  .cd-corner-flap,
  .cd-drag-pin-head,
  .cd-composer,
  .cd-agent-sidebar,
  .cd-skeleton-bar {
    animation: none !important;
    transition: none !important;
  }
}
`;
