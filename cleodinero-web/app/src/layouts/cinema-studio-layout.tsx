"use client";

/**
 * CinemaStudioLayout — workspace scaffold modeled on Higgsfield's Cinema
 * Studio (higgsfield.ai/generate): a Sidebar rail (nav actions, then a
 * Projects section), a feed pane
 * that scrolls under a COMPOSER floating bottom-centered over it, and an
 * optional Image/Video mode-switcher card to the composer's left.
 *
 * Sidebar: the product switcher header (appName + appLogo), the top nav
 * actions (real labels: "Home", "My generations", "My favorites"), and an
 * optional "Projects" section — the layout renders the section title, the app
 * provides the rows via `projectsSlot` (Sidebar.Item project rows plus its
 * own "New project" affordance and search, exactly like the real product's
 * project list).
 *
 * Feed: an optional `feedControls` row (the real product's Filter / View
 * cluster), then the feed area rendering `children` — build your generation
 * feed from quanta Grid/Media result cards (or a CSS-columns masonry). The
 * pane is the scroll container (generous min-h, relative), and its bottom padding keeps
 * the last cards reachable above the floating composer.
 *
 * Composer: build the prompt composer from quanta primitives (prompt input,
 * settings chips, marketingPrimary GENERATE with sparkles + credit cost) and
 * pass it as `composer`; the layout floats it bottom-centered OVER the feed. `modeSwitcher` renders on the composer's left on md+ — pass a
 * small stacked Image/Video glass switcher card (icon over caption label
 * per mode, selected mode on a white/10 fill).
 *
 * NO app header/top bar and NO credits/balance/sign-out chrome anywhere:
 * marketplace apps render inside Higgsfield and the host chrome provides the
 * global header and account controls. The only rails an app renders itself
 * are this Sidebar and in-content rows like `feedControls`.
 *
 * Purely presentational: every piece of data and every handler arrives via
 * props. Copy into a route and adapt.
 *
 * fnf-react wiring recipe (see app/packages/fnf-react/ai/AGENTS.md):
 * - Feed: useInfiniteQuery({ ...jobsFeedQueryOptions(jobClient, { size: 20 },
 *   { scopeKey }), select: flattenFeedPages }) feeds the feed rendered
 *   as `children`; poll in-flight cards with generationQueryOptions.
 * - Generate: const run = useGenerationRun(jobClient, { scopeKey }); the
 *   composer form's onSubmit starts it; after the run resolves call
 *   prependGenerations so fresh work tops the feed.
 * - Cost & uploads: costQueryOptions feeds the composer form's `cost`;
 *   useAttachments(mediaClient) feeds its `attachments` chips.
 */

import type { ReactNode } from "react";
import { Sidebar } from "@higgsfield/quanta/sidebar";
import { cn } from "@/lib/utils";

export interface CinemaStudioNavItem {
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}

export interface CinemaStudioLayoutProps {
  /** Product name shown in the sidebar switcher. */
  appName: string;
  /** Brand mark next to the product name (any node, ~20px). */
  appLogo?: ReactNode;
  /** Top nav actions (e.g. Home / My generations / My favorites). */
  navItems: CinemaStudioNavItem[];
  /** Rows of the "Projects" sidebar section — the layout renders the header;
   * bring your own Sidebar.Item project rows and "New project" affordance. */
  projectsSlot?: ReactNode;
  /** Row above the feed (filter / view controls). */
  feedControls?: ReactNode;
  /** The feed area — render your generation feed here. */
  children: ReactNode;
  /** The floating composer (your quanta-built prompt surface). */
  composer: ReactNode;
  /** Left of the composer on md+ — the Image/Video mode switcher. */
  modeSwitcher?: ReactNode;
  className?: string;
}

export function CinemaStudioLayout({
  appName,
  appLogo,
  navItems,
  projectsSlot,
  feedControls,
  children,
  composer,
  modeSwitcher,
  className,
}: CinemaStudioLayoutProps) {
  return (
    <div className={cn("flex h-dvh bg-q-background-primary text-q-text-primary", className)}>
      <div className="h-full shrink-0">
        <Sidebar.Root product="cinema-studio" flush>
          <Sidebar.Header>
            <Sidebar.Switcher>
              {appLogo ? <Sidebar.Logo>{appLogo}</Sidebar.Logo> : null}
              <Sidebar.Title>{appName}</Sidebar.Title>
            </Sidebar.Switcher>
          </Sidebar.Header>
          <Sidebar.Body>
            <Sidebar.Section>
              <Sidebar.SectionItems>
                {navItems.map((item) => (
                  <Sidebar.Item
                    key={item.label}
                    start={item.icon}
                    title={item.label}
                    selected={item.selected}
                    onClick={item.onSelect}
                  />
                ))}
              </Sidebar.SectionItems>
            </Sidebar.Section>
            {projectsSlot ? (
              <Sidebar.Section>
                <Sidebar.SectionHeader>
                  <Sidebar.SectionTitle>Projects</Sidebar.SectionTitle>
                </Sidebar.SectionHeader>
                <Sidebar.SectionItems>{projectsSlot}</Sidebar.SectionItems>
              </Sidebar.Section>
            ) : null}
          </Sidebar.Body>
        </Sidebar.Root>
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {feedControls ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
            {feedControls}
          </div>
        ) : null}

        {/* The feed pane: its own scroll container, so results scroll under
            the floating composer; pb-56 keeps the last row reachable. */}
        <main className="relative min-h-96 flex-1">
          <div className="absolute inset-0 overflow-y-auto px-4 pb-56 pt-2 md:px-6">
            {children}
          </div>

          <div className="absolute inset-x-0 bottom-4 z-10 mx-auto w-full max-w-3xl px-4">
            <div className="flex items-stretch gap-2">
              {modeSwitcher ? (
                <div className="hidden shrink-0 self-end md:block">{modeSwitcher}</div>
              ) : null}
              <div className="min-w-0 flex-1">{composer}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
