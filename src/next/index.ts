"use client";

import * as React from "react";
import {
  ContextDrop as ReactContextDrop,
  useContextDrop,
  type ContextDropHandle,
  type ContextDropProps
} from "../react/index.ts";

export type {
  ContextDropHandle,
  ContextDropProps,
  FeedbackDeleteResponse,
  FeedbackSubmissionPayload,
  FeedbackSubmissionResponse,
  FeedbackUpdatePayload,
  FeedbackUpdateResponse,
  SelectionMode,
  WidgetConfig,
  WidgetPosition
} from "../react/index.ts";
export { useContextDrop };

/**
 * Drop-in Next.js Client Component for App Router (`app/layout.tsx`) and Pages Router (`pages/_app.tsx`).
 *
 * Defaults `endpoint` to `"/api/context-drop"` (matching `createContextDropNextHandler()`).
 * Pass `endpoint="/context_drop"` or `endpoint="https://api.example.com/context_drop"` when connecting
 * to a Ruby on Rails ContextDrop backend.
 */
export const ContextDrop = React.forwardRef<ContextDropHandle, ContextDropProps>(
  function NextContextDrop(props, ref) {
    const { endpoint = "/api/context-drop", metadata, ...rest } = props;

    const mergedMetadata = React.useMemo(
      () => ({
        framework: "nextjs",
        ...(metadata ?? {})
      }),
      [metadata]
    );

    return React.createElement(ReactContextDrop, {
      ...rest,
      ref,
      endpoint,
      metadata: mergedMetadata
    });
  }
);

export const ContextDropWidget = ContextDrop;

