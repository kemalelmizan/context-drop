"use client";

import * as React from "react";
import type {
  FeedbackDeleteResponse,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  FeedbackUpdatePayload,
  FeedbackUpdateResponse,
  SelectionMode,
  WidgetConfig,
  WidgetPosition
} from "../../app/javascript/context_drop/types.ts";
import {
  ContextDropWidgetElement,
  registerContextDropWidget
} from "../../app/javascript/context_drop/widget.ts";

export type {
  FeedbackDeleteResponse,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  FeedbackUpdatePayload,
  FeedbackUpdateResponse,
  SelectionMode,
  WidgetConfig,
  WidgetPosition
};
export { ContextDropWidgetElement, registerContextDropWidget };

export interface ContextDropHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  element: ContextDropWidgetElement | null;
}

export type ReactWidgetPosition =
  | WidgetPosition
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export interface ContextDropProps {
  /**
   * Base URL for the ContextDrop backend API.
   * - Next.js standalone route handler: `"/api/context-drop"`
   * - Rails Engine (same-origin or proxied): `"/context_drop"`
   * - Cross-origin Rails / Next.js server: `"https://api.example.com/context_drop"`
   */
  endpoint?: string;
  /**
   * Viewport corner where the folded launcher rests (accepts both `"bottom_right"` and `"bottom-right"`).
   */
  position?: ReactWidgetPosition;
  /**
   * Custom composer textarea placeholder text.
   */
  placeholder?: string;
  /**
   * Scoped widget color theme (`"light"` or `"dark"`). Never alters host page styles.
   */
  theme?: "light" | "dark";
  /**
   * Override element picker mode (`"smart"` for non-technical end users, `"verbose"` for QA/devs).
   */
  selectionMode?: SelectionMode;
  /**
   * Environment stamp (`"development"`, `"staging"`, `"production"`, etc.).
   */
  environment?: string;
  /**
   * Custom JSON-serializable key-value metadata attached to every submission (e.g. `userId`, `plan`, `release`).
   */
  metadata?: Record<string, unknown>;
  /**
   * Optional inline `WidgetConfig` overrides. When provided, skips the initial `GET /config` request.
   */
  config?: Partial<WidgetConfig>;
  /**
   * Fetch credentials mode (`"same-origin"`, `"include"`, or `"omit"`).
   */
  credentials?: RequestCredentials;
  /**
   * Custom HTTP headers sent on ContextDrop API requests (e.g. `Authorization` or tenant headers).
   */
  headers?: Record<string, string>;
  /**
   * When `true`, unmounts and disables the widget completely.
   */
  disabled?: boolean;
  /**
   * Fired after a feedback submission succeeds.
   */
  onSubmitted?: (event: {
    response: FeedbackSubmissionResponse;
    payload: FeedbackSubmissionPayload;
  }) => void;
  /**
   * Fired after a user updates one of their own feedbacks.
   */
  onUpdated?: (event: {
    response: FeedbackUpdateResponse;
    payload: FeedbackUpdatePayload;
  }) => void;
  /**
   * Fired after a user soft-deletes one of their own feedbacks.
   */
  onDeleted?: (event: {
    response: FeedbackDeleteResponse;
    id: number | string;
  }) => void;
  /**
   * Fired when a feedback submission fails.
   */
  onError?: (event: { error: string }) => void;
  /**
   * Fired when the feedback composer opens or closes.
   */
  onOpenChange?: (open: boolean) => void;
}

export const ContextDrop = React.forwardRef<ContextDropHandle, ContextDropProps>(
  function ContextDrop(props, forwardedRef) {
    const {
      endpoint = "/context_drop",
      position,
      placeholder,
      theme,
      selectionMode,
      environment,
      metadata,
      config,
      credentials,
      headers,
      disabled = false,
      onSubmitted,
      onUpdated,
      onDeleted,
      onError,
      onOpenChange
    } = props;

    const [mounted, setMounted] = React.useState(false);
    const elementRef = React.useRef<ContextDropWidgetElement | null>(null);

    const onSubmittedRef = React.useRef(onSubmitted);
    const onUpdatedRef = React.useRef(onUpdated);
    const onDeletedRef = React.useRef(onDeleted);
    const onErrorRef = React.useRef(onError);
    const onOpenChangeRef = React.useRef(onOpenChange);
    onSubmittedRef.current = onSubmitted;
    onUpdatedRef.current = onUpdated;
    onDeletedRef.current = onDeleted;
    onErrorRef.current = onError;
    onOpenChangeRef.current = onOpenChange;

    React.useEffect(() => {
      registerContextDropWidget();
      setMounted(true);
    }, []);

    React.useImperativeHandle(
      forwardedRef,
      () => ({
        open: () => elementRef.current?.openComposer(),
        close: () => elementRef.current?.closeComposer(),
        toggle: () => elementRef.current?.toggleComposer(),
        get element() {
          return elementRef.current;
        }
      }),
      []
    );

    const serializedMetadata = React.useMemo(
      () => (metadata ? JSON.stringify(metadata) : undefined),
      [metadata]
    );
    const serializedConfig = React.useMemo(
      () => (config ? JSON.stringify(config) : undefined),
      [config]
    );

    React.useEffect(() => {
      const el = elementRef.current;
      if (!el) return;
      if (headers) {
        el.setHeaders(headers);
      } else {
        el.setHeaders({});
      }
    }, [mounted, headers]);

    React.useEffect(() => {
      const el = elementRef.current;
      if (!el) return;

      const handleSubmit = (ev: Event) => {
        const detail = (ev as CustomEvent).detail as
          | { response: FeedbackSubmissionResponse; payload: FeedbackSubmissionPayload }
          | undefined;
        if (detail && onSubmittedRef.current) {
          onSubmittedRef.current(detail);
        }
      };

      const handleUpdate = (ev: Event) => {
        const detail = (ev as CustomEvent).detail as
          | { response: FeedbackUpdateResponse; payload: FeedbackUpdatePayload }
          | undefined;
        if (detail && onUpdatedRef.current) {
          onUpdatedRef.current(detail);
        }
      };

      const handleDelete = (ev: Event) => {
        const detail = (ev as CustomEvent).detail as
          | { response: FeedbackDeleteResponse; id: number | string }
          | undefined;
        if (detail && onDeletedRef.current) {
          onDeletedRef.current(detail);
        }
      };

      const handleError = (ev: Event) => {
        const detail = (ev as CustomEvent).detail as { error: string } | undefined;
        if (detail && onErrorRef.current) {
          onErrorRef.current(detail);
        }
      };

      const handleOpen = () => {
        onOpenChangeRef.current?.(true);
      };

      const handleClose = () => {
        onOpenChangeRef.current?.(false);
      };

      el.addEventListener("context-drop:submit", handleSubmit);
      el.addEventListener("context-drop:update", handleUpdate);
      el.addEventListener("context-drop:delete", handleDelete);
      el.addEventListener("context-drop:error", handleError);
      el.addEventListener("context-drop:open", handleOpen);
      el.addEventListener("context-drop:close", handleClose);

      return () => {
        el.removeEventListener("context-drop:submit", handleSubmit);
        el.removeEventListener("context-drop:update", handleUpdate);
        el.removeEventListener("context-drop:delete", handleDelete);
        el.removeEventListener("context-drop:error", handleError);
        el.removeEventListener("context-drop:open", handleOpen);
        el.removeEventListener("context-drop:close", handleClose);
      };
    }, [mounted, disabled]);

    if (!mounted || disabled) {
      return null;
    }

    const elementAttributes: Record<string, unknown> = {
      ref: elementRef,
      "data-endpoint": endpoint
    };
    if (position) elementAttributes["data-position"] = position.replace("-", "_");
    if (placeholder) elementAttributes["data-placeholder"] = placeholder;
    if (theme) elementAttributes["data-cd-theme"] = theme;
    if (selectionMode) elementAttributes["data-selection-mode"] = selectionMode;
    if (environment) elementAttributes["data-environment"] = environment;
    if (credentials) elementAttributes["data-credentials"] = credentials;
    if (serializedMetadata) elementAttributes["data-metadata"] = serializedMetadata;
    if (serializedConfig) elementAttributes["data-config"] = serializedConfig;

    return React.createElement("context-drop-widget", elementAttributes);
  }
);

export const ContextDropWidget = ContextDrop;

/**
 * Imperative helper hook to open, close, or toggle the mounted `<ContextDrop />` widget
 * from any button or menu item in your React/Next.js tree without requiring a Context Provider.
 */
export function useContextDrop() {
  const getElement = React.useCallback((): ContextDropWidgetElement | null => {
    if (typeof document === "undefined") return null;
    return document.querySelector("context-drop-widget") as ContextDropWidgetElement | null;
  }, []);

  const open = React.useCallback(() => {
    getElement()?.openComposer();
  }, [getElement]);

  const close = React.useCallback(() => {
    getElement()?.closeComposer();
  }, [getElement]);

  const toggle = React.useCallback(() => {
    getElement()?.toggleComposer();
  }, [getElement]);

  return {
    open,
    close,
    toggle,
    getElement
  };
}
