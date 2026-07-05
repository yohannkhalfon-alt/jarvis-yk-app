"use client";

/**
 * ShortsStudioLayout + ShortsStudioForm — scaffolds modeled on Higgsfield's
 * Shorts Studio (higgsfield.ai/shorts-studio).
 *
 * ShortsStudioLayout is the tabbed studio shell: a tab row with the tab
 * list on the left (real tabs: "Presets", "History", "How it works") and a
 * `tabControls` slot on the right — the real product puts a search Input on
 * Presets and a "Liked" toggle on History — over a scrollable content area
 * rendering the active tab's content (`children`). The app composes that
 * content itself; in the real product:
 * - Presets: a responsive grid of preset cards (preview media + preset name
 *   + hover actions) plus a leading "Create custom preset" card.
 * - History: a grid of session cards — cover image, a status Badge while
 *   generating or after failure, and like/download actions on hover.
 * - How it works: guide copy and example clips.
 *
 * ShortsStudioForm is the creation form card (rounded bordered surface).
 * `children` holds the fields — in the real product a preset picker card
 * with a "Change" pencil action, a video upload field with constraints copy
 * ("Max duration", "Max size"), and an "Output ratio:" segmented toggle
 * offering "Vertical" / "Landscape". The footer stacks an optional `hint`
 * line and ONE full-width tall marketingPrimary Generate button carrying the
 * credit cost; while `busy` it locks and shows a Loader (the real product
 * swaps the label to "Generating..." — pass that via `generateLabel` if you
 * want the same).
 *
 * Both are purely presentational: data and handlers arrive via props. Copy
 * into a route and adapt.
 *
 * fnf-react wiring recipe (see app/packages/fnf-react/ai/AGENTS.md):
 * - Upload: useAttachments(mediaClient) behind the video field; await
 *   attachments.settled() before starting the run.
 * - Generate: const run = useGenerationRun(jobClient, { scopeKey });
 *   onGenerate={() => run.start({ model, media, settings })}; busy while
 *   run.status is "submitting" or "generating".
 * - History tab: useInfiniteQuery({ ...jobsFeedQueryOptions(jobClient,
 *   { size: 20 }, { scopeKey }), select: flattenFeedPages }) for the session
 *   grid; poll one session with generationQueryOptions; after a run resolves
 *   call prependGenerations so it tops the feed.
 * - Cost: costQueryOptions feeds the Generate button's `cost`.
 */

import type { ReactNode } from "react";
import { Button } from "@higgsfield/quanta/button";
import Sparkles from "@/assets/icon-sparkles-soft.svg?react";
import { Loader } from "@higgsfield/quanta/loader";
import { Tabs } from "@higgsfield/quanta/tabs";
import { cn } from "@/lib/utils";

export interface ShortsStudioTab {
  id: string;
  label: string;
}

export interface ShortsStudioLayoutProps {
  tabs: ShortsStudioTab[];
  /** Id of the active tab (must be one of `tabs`). */
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Right side of the tab row (search input, filter toggles). */
  tabControls?: ReactNode;
  /** The active tab's content — preset grid, session grid, guide copy. */
  children: ReactNode;
  className?: string;
}

export function ShortsStudioLayout({
  tabs,
  activeTab,
  onTabChange,
  tabControls,
  children,
  className,
}: ShortsStudioLayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-7xl flex-col bg-q-background-primary px-4 py-6 text-q-text-primary md:px-8",
        className,
      )}
    >
      <Tabs.Root
        value={activeTab}
        onValueChange={(value) => onTabChange(String(value))}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs.List items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} />
          {tabControls ? <div className="flex items-center gap-2">{tabControls}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Tabs.Root>
    </div>
  );
}

export interface ShortsStudioFormProps {
  /** The creation fields (preset picker, video upload, output ratio). */
  children: ReactNode;
  /** Quiet line above the Generate button (limits, tips). */
  hint?: string;
  generateLabel?: string;
  /** Generation in flight: the button locks and shows a loader. */
  busy?: boolean;
  /** Credit cost shown on the Generate button (e.g. "40"). */
  cost?: string;
  onGenerate: () => void;
  generateDisabled?: boolean;
  className?: string;
}

export function ShortsStudioForm({
  children,
  hint,
  generateLabel = "Generate",
  busy = false,
  cost,
  onGenerate,
  generateDisabled = false,
  className,
}: ShortsStudioFormProps) {
  return (
    <section
      className={cn(
        "flex w-full flex-col gap-4 rounded-3xl border border-q-border-subtle bg-q-background-secondary p-4 md:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3">{children}</div>
      <footer className="flex flex-col gap-2">
        {hint ? (
          <p className="text-center text-q-body-sm-regular text-q-text-tertiary">{hint}</p>
        ) : null}
        <Button
          variant="marketingPrimary"
          size="lg"
          className="w-full"
          disabled={generateDisabled || busy}
          start={busy ? <Loader size="xs" color="neutral" aria-label="Working" /> : undefined}
          onClick={onGenerate}
        >
          {generateLabel}
          {cost ? (
            <span className="flex items-center gap-1">
              <Sparkles width={14} height={14} aria-hidden="true" />
              {cost}
            </span>
          ) : null}
        </Button>
      </footer>
    </section>
  );
}
