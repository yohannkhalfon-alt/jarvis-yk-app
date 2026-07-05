"use client";

/**
 * UpscalerLayout — single-asset enhancer scaffold modeled on Higgsfield's
 * Upscale tool (higgsfield.ai/upscale): a media stage on the left and a
 * settings form panel (roughly 21rem) on the right; on mobile the stage
 * stacks above the form.
 *
 * Stage states:
 * - No `media`: a dashed-border empty card — optional `example` slot (the
 *   real tool shows a before/after showcase), a bold uppercase title
 *   ("Upscale"), a muted description ("Upload your images or videos to
 *   enhance their resolution and quality."), and an upload button
 *   ("Upload Media") — the page wires its own hidden file input in `onUpload`.
 * - With `media`: the asset fills the stage (rounded), with an optional
 *   `stageOverlay` (progress / failure overlays) and an optional `toolbar`
 *   row at the stage's bottom edge — in the real tool a before/after compare
 *   toggle plus download / save / delete icon actions.
 *
 * Form panel (shown once media is present, or forced via `formVisible`):
 * a rounded bordered column — title row (panel title + ghost "Reset"),
 * scrollable settings (`children`; the real tool stacks a model Select, a
 * scale-factor toggle group, and an "Advanced settings" collapsible), and a
 * sticky footer with ONE full-width marketingPrimary submit carrying the
 * credit cost and a Loader while busy.
 *
 * Purely presentational: all data and handlers arrive via props. Copy into a
 * route and adapt.
 *
 * fnf-react wiring recipe (see app/packages/fnf-react/ai/AGENTS.md):
 * - Upload: const attachments = useAttachments(mediaClient); onUpload opens
 *   your file input, attachments.add(files, { role }) on change, and the
 *   local preview becomes `media`.
 * - Submit: const run = useGenerationRun(jobClient, { scopeKey }); in
 *   onSubmit await attachments.settled(), then run.start({ model, media,
 *   settings }); busy while run.status is "submitting" or "generating" —
 *   surface progress through `stageOverlay`.
 * - Result: read the finished generation (run.generations or
 *   generationQueryOptions) and swap `media` to the enhanced asset;
 *   costQueryOptions feeds `cost`; prependGenerations if the app also keeps
 *   a feed.
 */

import type { ReactNode } from "react";
import { Button } from "@higgsfield/quanta/button";
import Sparkles from "@/assets/icon-sparkles-soft.svg?react";
import { Loader } from "@higgsfield/quanta/loader";
import { cn } from "@/lib/utils";

export interface UpscalerLayoutProps {
  /** Empty-state headline (rendered uppercase), e.g. "Upscale". */
  title: string;
  /** Empty-state description under the title. */
  description: string;
  /** Empty-state upload button label. */
  uploadLabel?: string;
  /** Opens the page's own file input. */
  onUpload: () => void;
  /** Optional showcase above the empty-state title (before/after example). */
  example?: ReactNode;
  /** The staged asset (img/video node). Null shows the empty state. */
  media?: ReactNode;
  /** Overlay centered over the staged media (progress, failure). */
  stageOverlay?: ReactNode;
  /** Action row at the stage's bottom edge (compare toggle, icon actions). */
  toolbar?: ReactNode;
  /** Form panel settings (model select, scale factors, advanced settings). */
  children?: ReactNode;
  /** Form panel heading. */
  panelTitle?: string;
  /** Shows a ghost "Reset" button in the panel title row when provided. */
  onReset?: () => void;
  submitLabel?: string;
  /** Credit cost shown on the submit button (e.g. "5"). */
  cost?: string;
  /** Enhancement in flight: the submit locks and shows a loader. */
  busy?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  /** Overrides the default panel visibility (default: media is present). */
  formVisible?: boolean;
  className?: string;
}

export function UpscalerLayout({
  title,
  description,
  uploadLabel = "Upload Media",
  onUpload,
  example,
  media,
  stageOverlay,
  toolbar,
  children,
  panelTitle = "Upscale",
  onReset,
  submitLabel = "Upscale",
  cost,
  busy = false,
  submitDisabled = false,
  onSubmit,
  formVisible,
  className,
}: UpscalerLayoutProps) {
  const showForm = formVisible ?? media != null;

  return (
    <div
      className={cn(
        "mx-auto min-h-dvh w-full max-w-7xl bg-q-background-primary p-4 text-q-text-primary md:p-6",
        className,
      )}
    >
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <section aria-label="Media stage" className="flex min-w-0 flex-col gap-3">
          {media != null ? (
            <>
              <div className="relative min-h-96 overflow-hidden rounded-2xl bg-q-background-secondary">
                <div className="flex h-full w-full items-center justify-center">{media}</div>
                {stageOverlay ? (
                  <div className="absolute inset-0 z-10 grid place-items-center">
                    {stageOverlay}
                  </div>
                ) : null}
              </div>
              {toolbar ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {toolbar}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-q-border-default bg-q-background-secondary p-8 text-center">
              {example}
              <h1 className="text-q-title-lg-semi-bold uppercase tracking-wide">{title}</h1>
              <p className="max-w-96 text-q-body-sm-regular text-q-text-secondary">
                {description}
              </p>
              <Button variant="tertiary" size="md" onClick={onUpload}>
                {uploadLabel}
              </Button>
            </div>
          )}
        </section>

        {showForm ? (
          <aside
            aria-label="Settings"
            className="flex w-full flex-col overflow-hidden rounded-2xl border border-q-border-subtle bg-q-background-secondary md:max-h-[calc(100dvh-3rem)] md:w-84"
          >
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
              <h2 className="text-q-title-sm-semi-bold">{panelTitle}</h2>
              {onReset ? (
                <Button variant="ghost" size="xs" onClick={onReset}>
                  Reset
                </Button>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
            <footer className="sticky bottom-0 border-t border-q-border-subtle bg-q-background-secondary p-4">
              <Button
                variant="marketingPrimary"
                size="md"
                className="w-full"
                disabled={submitDisabled || busy}
                start={
                  busy ? <Loader size="xs" color="neutral" aria-label="Working" /> : undefined
                }
                onClick={onSubmit}
              >
                {submitLabel}
                {cost ? (
                  <span className="flex items-center gap-1">
                    <Sparkles width={14} height={14} aria-hidden="true" />
                    {cost}
                  </span>
                ) : null}
              </Button>
            </footer>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
