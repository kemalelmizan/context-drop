export const WIDGET_SHADOW_STYLES = `
:host {
  all: initial;
  --cd-primary: #2563eb;
  --cd-primary-hover: #1d4ed8;
  --cd-surface: #ffffff;
  --cd-surface-subtle: #f8fafc;
  --cd-border: #e2e8f0;
  --cd-text: #0f172a;
  --cd-text-muted: #64748b;
  --cd-danger: #dc2626;
  --cd-success: #16a34a;
  --cd-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.14), 0 8px 10px -6px rgba(15, 23, 42, 0.08);
  --cd-radius: 14px;
  --cd-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-family: var(--cd-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--cd-text);
  z-index: 2147483640;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.cd-root {
  position: fixed;
  z-index: 2147483640;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.cd-root.pos-bottom_right {
  bottom: 20px;
  right: 20px;
  align-items: flex-end;
}

.cd-root.pos-bottom_left {
  bottom: 20px;
  left: 20px;
  align-items: flex-start;
}

.cd-root.pos-top_right {
  top: 20px;
  right: 20px;
  align-items: flex-end;
}

.cd-root.pos-top_left {
  top: 20px;
  left: 20px;
  align-items: flex-start;
}

.cd-trigger {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 9999px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: var(--cd-text);
  color: #ffffff;
  font-family: var(--cd-font);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--cd-shadow);
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.cd-trigger:hover {
  background: #1e293b;
  transform: translateY(-1px);
}

.cd-trigger:focus-visible,
.cd-btn:focus-visible,
.cd-icon-btn:focus-visible,
.cd-textarea:focus-visible,
.cd-chip-remove:focus-visible {
  outline: 2px solid var(--cd-primary);
  outline-offset: 2px;
}

.cd-composer {
  pointer-events: auto;
  width: 380px;
  max-width: calc(100vw - 32px);
  background: var(--cd-surface);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  box-shadow: var(--cd-shadow);
  margin-bottom: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cd-composer[hidden] {
  display: none !important;
}

.cd-composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--cd-border);
}

.cd-composer-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-text);
  margin: 0;
}

.cd-icon-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--cd-text-muted);
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.cd-icon-btn:hover {
  background: var(--cd-surface-subtle);
  color: var(--cd-text);
}

.cd-textarea {
  width: 100%;
  min-height: 92px;
  max-height: 220px;
  resize: vertical;
  border: 0;
  padding: 12px 14px;
  font-family: var(--cd-font);
  font-size: 14px;
  line-height: 1.45;
  color: var(--cd-text);
  background: transparent;
}

.cd-textarea::placeholder {
  color: var(--cd-text-muted);
}

.cd-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 14px 10px;
}

.cd-tray:empty {
  display: none;
}

.cd-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px;
  background: var(--cd-surface-subtle);
  border: 1px solid var(--cd-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--cd-text);
}

.cd-chip-thumb {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--cd-border);
}

.cd-chip-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 4px;
  background: #dbeafe;
  color: #1e40af;
}

.cd-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.cd-chip-remove {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--cd-text-muted);
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}

.cd-chip-remove:hover {
  color: var(--cd-danger);
}

.cd-status {
  padding: 6px 14px;
  font-size: 12px;
}

.cd-status[hidden] {
  display: none !important;
}

.cd-status.error {
  color: var(--cd-danger);
  background: #fef2f2;
}

.cd-status.success {
  color: var(--cd-success);
  background: #f0fdf4;
}

.cd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--cd-surface-subtle);
  border-top: 1px solid var(--cd-border);
}

.cd-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cd-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface);
  color: var(--cd-text);
  font-family: var(--cd-font);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.cd-btn:hover:not(:disabled) {
  background: #f1f5f9;
}

.cd-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cd-btn-primary {
  background: var(--cd-primary);
  border-color: var(--cd-primary);
  color: #ffffff;
  font-weight: 600;
}

.cd-btn-primary:hover:not(:disabled) {
  background: var(--cd-primary-hover);
}

@media (max-width: 480px) {
  .cd-composer {
    width: calc(100vw - 24px);
  }
}
`;
