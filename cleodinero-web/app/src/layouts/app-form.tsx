"use client";

/**
 * AppForm — the generation form for a simple one-shot `type: "app"` tool,
 * modeled on the form in Higgsfield's own face-swap app
 * (higgsfield.ai/apps/face-swap): the tool's
 * input fields on top, then a footer with an optional mode toggle, an optional
 * settings row, the submit row (optional accessory + ONE full-width
 * marketing-primary button — Quanta's accent generation CTA — with an
 * optional credit cost), and a quiet helper line.
 *
 * This is ONLY the form — compose it into whatever page the product needs
 * (the face-swap app pairs it with a title block and a large preview panel;
 * your app decides). Purely presentational: all data and handlers arrive via props.
 * Copy into a route and adapt.
 *
 * Face-swap-style usage: two upload cards in `children` labelled like the real
 * app — "Target Image" ("Upload the photo with face to replace") and
 * "Your Photo" ("Upload the face you want to insert") — side by side via
 * `flex flex-col gap-3 md:flex-row`, each card `flex-1`; submitLabel
 * "Face Swap", `cost` from the cost query, helperText like "You have 3 free
 * face swap generations left".
 *
 * fnf-react wiring recipe (see app/packages/fnf-react/ai/AGENTS.md):
 * - Uploads: useAttachments(mediaClient, { upload: ... }) behind the input
 *   cards; await attachments.settled() before starting the run.
 * - Submit: const run = useGenerationRun(jobClient, { scopeKey }); pass
 *   onSubmit={() => run.start(input)} and busy while it submits/generates.
 * - Cost: costQueryOptions for `cost`.
 * - Results: render run.generations (or poll with generationQueryOptions)
 *   wherever your page shows them (compose result cards from quanta Media/Card).
 */

import type { FormEvent, ReactNode } from "react";
import { Button } from "@higgsfield/quanta/button";
import { Loader } from "@higgsfield/quanta/loader";
import Sparkles from "@/assets/icon-sparkles-soft.svg?react";
import { cn } from "@/lib/utils";

export interface AppFormProps {
  /** The tool's input fields. Pair uploads side by side on desktop:
   * `<div className="flex flex-col gap-3 md:flex-row">` with each card `flex-1`. */
  children: ReactNode;
  /** Optional mode row above the settings (the face-swap app uses it for
   * the "Generation type" image/video toggle). */
  modeToggle?: ReactNode;
  /** Optional settings row above the submit row (aspect ratio, quality). */
  settings?: ReactNode;
  /** Optional control rendered beside the submit button (e.g. a quality
   * select). */
  submitAccessory?: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  disabled?: boolean;
  /** Generation in flight: the submit locks and shows a loader. */
  busy?: boolean;
  /** Credit cost inside the submit button, next to a sparkles icon
   * (e.g. "5"). ALWAYS pass it: generate buttons show their cost. */
  cost?: string;
  /** Quiet centered line under the submit row (e.g. remaining free generations). */
  helperText?: string;
  className?: string;
}

export function AppForm({
  children,
  modeToggle,
  settings,
  submitAccessory,
  submitLabel,
  onSubmit,
  disabled = false,
  busy = false,
  cost,
  helperText,
  className,
}: AppFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || busy) return;
    onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("grid min-w-0 grid-rows-[1fr_auto] gap-4", className)}
    >
      <div className="flex min-w-0 flex-col gap-3">{children}</div>

      <div className="flex min-w-0 flex-col gap-4">
        {modeToggle ? (
          <div className="flex items-center justify-between gap-2">{modeToggle}</div>
        ) : null}

        {settings ? (
          <div className="flex flex-wrap items-center gap-2">{settings}</div>
        ) : null}

        <div className="flex min-w-0 flex-row gap-2">
          {submitAccessory}
          <Button
            type="submit"
            variant="marketingPrimary"
            size="md"
            disabled={disabled || busy}
            start={
              busy ? <Loader size="xs" color="neutral" aria-label="Working" /> : undefined
            }
            className="w-full min-w-0"
          >
            {submitLabel}
            {cost ? (
              <span className="flex items-center gap-1">
                <Sparkles width={14} height={14} aria-hidden="true" />
                {cost}
              </span>
            ) : null}
          </Button>
        </div>

        {helperText ? (
          <p className="text-center text-q-body-sm-regular text-q-text-secondary">
            {helperText}
          </p>
        ) : null}
      </div>
    </form>
  );
}
