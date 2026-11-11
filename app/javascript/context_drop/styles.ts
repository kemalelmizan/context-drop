export const WIDGET_SHADOW_STYLES = `
:host {
  all: initial;
  --cd-ink: #111318;
  --cd-ink-secondary: #4b5262;
  --cd-ink-subtle: #5c6478;
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
  --cd-shadow-pin: 0 12px 24px -6px rgba(17, 19, 24, 0.24), 0 4px 10px -3px rgba(17, 19, 24, 0.12);
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

*, *::before, *::after {
  box-sizing: border-box;
}

::selection {
  background: var(--cd-pin-soft);
  color: var(--cd-ink);
}

.cd-root {
  position: fixed;
  z-index: 2147483640;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  max-width: calc(100vw - 24px);
}

.cd-root.pos-top_left {
  top: 20px;
  left: 20px;
  align-items: flex-start;
}

.cd-root.pos-top_right {
  top: 20px;
  right: 20px;
  align-items: flex-end;
}

.cd-root.pos-bottom_left {
  bottom: 20px;
  left: 20px;
  align-items: flex-start;
}

.cd-root.pos-bottom_right {
  bottom: 20px;
  right: 20px;
  align-items: flex-end;
}

.cd-root.is-free-positioned {
  bottom: auto;
  right: auto;
  align-items: flex-start;
}

/* Focus states across all interactive controls */
button:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 2px;
}

/* Custom themed scrollbars */
.cd-chat-thread::-webkit-scrollbar,
.cd-tray::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.cd-chat-thread::-webkit-scrollbar-track,
.cd-tray::-webkit-scrollbar-track {
  background: transparent;
}

.cd-chat-thread::-webkit-scrollbar-thumb,
.cd-tray::-webkit-scrollbar-thumb {
  background: var(--cd-border);
  border-radius: 9999px;
}

/* Freely Floating Pin Trigger Dock */
.cd-pin-dock {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--cd-ink);
  color: var(--cd-surface);
  border: 1px solid rgba(250, 249, 246, 0.14);
  border-radius: 9999px 9999px 9999px 6px;
  box-shadow: var(--cd-shadow-pin);
  user-select: none;
  touch-action: none;
  transition: transform 0.18s var(--cd-ease), box-shadow 0.18s var(--cd-ease);
}

.cd-pin-dock[hidden] {
  display: none !important;
}

.cd-pin-dock.is-dragging {
  cursor: grabbing;
  transform: scale(1.03);
}

.cd-pin-dock-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 3px 4px 5px;
  color: #9ca3b5;
  cursor: grab;
}

.cd-pin-dock-grip:active {
  cursor: grabbing;
}

.cd-floating-pin-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border-radius: 9999px 9999px 9999px 4px;
  border: 0;
  background: var(--cd-pin);
  color: var(--cd-surface);
  font-family: var(--cd-font);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s var(--cd-ease), transform 0.15s var(--cd-ease);
}

.cd-floating-pin-btn:hover {
  background: var(--cd-pin-hover);
}

.cd-floating-pin-btn.is-active {
  background: var(--cd-accent);
}

.cd-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 9999px;
  border: 0;
  background: transparent;
  color: var(--cd-surface);
  font-family: var(--cd-font);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s var(--cd-ease);
}

.cd-trigger:hover {
  background: rgba(250, 249, 246, 0.12);
}

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

/* Compact Minimized Session Coach Bar (active while pinning elements or minimized) */
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

/* Main Floating Chatbox Composer Window */
.cd-composer {
  pointer-events: auto;
  width: 400px;
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

.cd-composer.is-dragging-over {
  border-color: var(--cd-accent);
}

/* Chatbox Header with Top-Left Pin Selector & Drag Bar */
.cd-composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  background: var(--cd-surface-recessed);
  border-bottom: 1px solid var(--cd-border);
  cursor: grab;
  user-select: none;
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
}

/* Pin-Shaped Selector on the Top-Left Corner of the Chatbox */
.cd-pin-corner-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 11px 11px 11px 3px;
  border: 1px solid rgba(194, 65, 12, 0.25);
  background: var(--cd-pin);
  color: var(--cd-surface);
  font-family: var(--cd-font);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 10px -2px rgba(194, 65, 12, 0.28);
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
}

.cd-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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
  transition: background-color 0.12s ease, color 0.12s ease;
}

.cd-icon-btn:hover:not(:disabled) {
  background: rgba(17, 19, 24, 0.06);
  color: var(--cd-ink);
}

.cd-icon-btn:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

/* Conversational Chat Thread */
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

.cd-chat-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--cd-surface-recessed);
  border: 1px solid var(--cd-border-subtle);
  border-radius: var(--cd-radius-md);
  color: var(--cd-ink-secondary);
  font-size: 12.5px;
}

.cd-chat-empty-text {
  margin: 0;
  color: var(--cd-ink);
  font-weight: 500;
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

/* Pinned Elements & Attachments Context Tray */
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
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.cd-btn:hover:not(:disabled) {
  background: var(--cd-surface-recessed);
  border-color: var(--cd-ink-secondary);
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

@media (max-width: 520px) {
  .cd-composer,
  .cd-compact-bar {
    width: calc(100vw - 20px);
    min-width: 0;
  }

  .cd-compact-bar {
    flex-wrap: wrap;
  }
}
`;
