"use client";

/**
 * StepperLayout — staged generation flow scaffold modeled on Higgsfield's
 * Shots app (higgsfield.ai/apps/shots). It is NOT a Back/Continue wizard:
 * each step supplies its own action row, and completing that action is what
 * advances the flow (the page bumps `activeStep` after the step's work lands).
 *
 * Anatomy, top to bottom:
 * - Step indicator (centered): a numbered circle + label per step, separated
 *   by thin divider lines. The active step is full opacity, the rest sit at
 *   half. Steps up to `highestVisitedStep` are clickable so users can jump
 *   BACK to work they already saw; unvisited forward steps stay inert. The
 *   real product's steps: "Upload", "Grid", "Upscale".
 * - Stage: the active step's content (`children`), centered with generous
 *   height — an upload dropzone, the generated grid, the upscale preview.
 * - Actions row (under the stage): the step-scoped `actions` slot. In the
 *   real product step 1 pairs an aspect-ratio Select with a marketingPrimary
 *   "Generate" button (roughly `w-full md:w-80`); the final step swaps to
 *   secondary "Start new" / "Go to library" buttons plus icon actions
 *   (download, retry). Generation CTAs stay `variant="marketingPrimary"`
 *   with a `Loader size="xs" color="neutral"` while busy.
 * - Optional `history` strip below — recent generations, like AppForm pages.
 *
 * Purely presentational: state and handlers live in the page. Copy into a
 * route and adapt.
 *
 * fnf-react wiring recipe (see app/packages/fnf-react/ai/AGENTS.md):
 * - Keep `activeStep` / `highestVisitedStep` and collected inputs in the page;
 *   advance them after each step's action resolves.
 * - Uploads (step 1): useAttachments(mediaClient) behind the dropzone; await
 *   attachments.settled() before starting the run.
 * - Generate: const run = useGenerationRun(jobClient, { scopeKey }); the
 *   step's action calls run.start(input); derive busy from run.status
 *   ("submitting" or "generating").
 * - Results: poll with generationQueryOptions or read run.generations for the
 *   grid/upscale stages; costQueryOptions feeds the CTA's credit cost; call
 *   prependGenerations so finished work tops the `history` feed
 *   (jobsFeedQueryOptions + flattenFeedPages).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperLayoutProps {
  steps: StepperStep[];
  /** Index of the active step in `steps`. */
  activeStep: number;
  /**
   * Highest step index the user has reached; steps up to it are clickable
   * (back-jumping). Defaults to `activeStep`.
   */
  highestVisitedStep?: number;
  /** Fires with a visited step's index when its marker is clicked. */
  onStepChange?: (index: number) => void;
  /** The active step's stage content (dropzone, grid, preview…). */
  children: ReactNode;
  /** Step-scoped controls + primary action rendered under the stage. */
  actions?: ReactNode;
  /** Optional recent-generations strip below the actions row. */
  history?: ReactNode;
  className?: string;
}

export function StepperLayout({
  steps,
  activeStep,
  highestVisitedStep,
  onStepChange,
  children,
  actions,
  history,
  className,
}: StepperLayoutProps) {
  const visitedUpTo = Math.max(activeStep, highestVisitedStep ?? activeStep);

  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 bg-q-background-primary px-4 py-6 text-q-text-primary",
        className,
      )}
    >
      <nav aria-label="Steps">
        <ol className="flex flex-wrap items-center justify-center gap-2">
          {steps.map((step, index) => {
            const current = index === activeStep;
            const reachable = index <= visitedUpTo;
            return (
              <li key={step.id} className="flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="h-px w-6 bg-q-border-default md:w-8" />
                ) : null}
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  onClick={
                    reachable && !current && onStepChange
                      ? () => onStepChange(index)
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-2",
                    current ? "opacity-100" : "opacity-50",
                    reachable && !current && "cursor-pointer hover:opacity-80",
                  )}
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-q-background-tertiary text-q-label-sm-semi-bold">
                    {index + 1}
                  </span>
                  <span className="text-q-label-sm-medium">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-4xl">{children}</div>
      </main>

      {actions ? (
        <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}

      {history ? <section aria-label="Recent generations">{history}</section> : null}
    </div>
  );
}
