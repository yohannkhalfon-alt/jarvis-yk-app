# App layout scaffolds

Prop-driven, presentational starting points for the standard shapes of a
`type: "app"` product, each modeled on a live Higgsfield product. None of them
is imported by any route on purpose — the blank template stays blank. When you
build an app, COPY the closest layout into your route (or compose it from a
route file) and adapt it freely; a fully custom layout is fine whenever the
user asks for something these shapes don't cover.

## The five shapes

| File                          | Modeled on                                                        | Anatomy                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cinema-studio-layout.tsx`    | Cinema Studio (higgsfield.ai/generate)                            | Sidebar rail (nav, then Projects section), feed pane (`children` — your generation feed) with the composer floating bottom-center over it, Image/Video mode-switcher card slot, settings chips inside the composer, credit cost inside Generate |
| `stepper-layout.tsx`          | Shots (higgsfield.ai/apps/shots)                                  | Staged flow, NOT Back/Continue: step indicator (back-jump to visited steps), full-height stage, step-scoped actions row advances, optional history strip |
| `app-form.tsx`                | Face Swap (higgsfield.ai/apps/face-swap)                          | The generation form: input cards slot, optional mode toggle + settings, one full-width marketing-primary submit with credit cost, helper line — compose it into your own page |
| `upscaler-layout.tsx`         | Upscale (higgsfield.ai/upscale)                                   | Media stage (dashed empty-state upload card, overlay + toolbar slots) beside a ~21rem settings panel with reset title row and sticky costed submit          |
| `shorts-studio-layout.tsx`    | Shorts Studio (higgsfield.ai/shorts-studio)                       | Tabbed shell (Presets / History / How it works) with per-tab controls slot, plus a separate `ShortsStudioForm` card with a costed tall Generate footer   |

## Rules

- Everything arrives via props: data, handlers, and slot nodes. The layouts
  import only Quanta components and `cn` — never `@higgsfield/fnf-react`.
  There are no prebuilt feed/composer components: build those per app from
  Quanta primitives (helpers in `src/lib/higgsfield-generation-results.ts`
  map a Generation to its preview media).
- Keep the conventions when adapting: Quanta components before custom markup,
  `q-` semantic utilities for color/type, native Tailwind spacing (`p-4`,
  `gap-3`), real copy in every state (empty, busy, error) — no placeholder
  tokens.
- Layouts are CONTAINER-WIDTH: `mx-auto w-full max-w-7xl` on the shell (the
  body background fills the rest). The one exception is cinema-studio — a
  full-bleed workspace (sidebar + edge-to-edge feed).
- Apps render inside Higgsfield: NEVER add an app header/top bar (no
  brand/logo row, no top nav) and never credits/balance or sign-out controls —
  the host chrome provides all of that. In-app navigation goes in a Quanta
  `Sidebar` or inline controls (tabs, step indicators); page titles are
  headings inside the content area.
- The app is permanently DARK: `data-theme="default-dark"` is pinned on
  `<html>` in `src/routes/__root.tsx`. Never add a theme toggle, a light mode,
  quanta's bootstrapScript/ThemeController, or `dark:`-conditional styling.
- Generation CTAs are Quanta Button `variant="marketingPrimary"` (a Loader
  `size="xs" color="neutral"` while busy) and ALWAYS show the credit cost
  inside the button as `{label} {sparkles icon} {credits}` — the sparkle is
  the branded soft-sparkles asset
  (`import Sparkles from "@/assets/icon-sparkles-soft.svg?react"`, 14px) and
  the credits number inherits the button label's font (no smaller/other
  typography on it) — see any scaffold's submit. Variant reality check
  (names do NOT match the colors): `primary` = flat LIME, `secondary` = solid
  WHITE, `tertiary` = dark white/10 glass, `ghost` = transparent. Ordinary
  actions and navigation use the DARK `tertiary`/`ghost`; `secondary` (white)
  only where the real product uses a white button; flat lime `primary` is
  almost never right — the lime CTA is `marketingPrimary` (3D).
- Components Quanta lacks (date picker, calendar, sortable table, multiselect
  autocomplete, …): use the HeroUI fallback — `@heroui/react` is preinstalled
  and themed to the brand (src/heroui-theme.css). Import the component and add
  its structural CSS once in `src/styles.css`:
  `@import "@heroui/styles/components/<component>.css" layer(components);`.
  Never restyle HeroUI beyond that theme file, and never use HeroUI where a
  Quanta component exists (Button, Modal, Tabs, Select, … stay Quanta).
- Icons are Google Material Symbols (outlined, weight 400), imported per icon:
  `import Star from "@material-symbols/svg-400/outlined/star_shine.svg?react"`
  — one icon family everywhere; `-fill` variants only for very small glyphs.
- Generation feeds: result cards composed from quanta `Media`/`Card` inside
  a Quanta `Grid` with `cols="auto-fit"` — resize `minColWidth` rather than
  adding breakpoint class ladders (cinema-studio style feeds can use CSS
  columns masonry instead).

## Wiring the data (fnf-react)

Each layout's header comment carries its exact recipe. In short, from
`app/packages/fnf-react/ai/AGENTS.md`:

- Submit prompts/runs with `useGenerationRun(jobClient, { scopeKey })`; map its
  status to the layout's `busy`/`generating` prop.
- Read feeds with `jobsFeedQueryOptions` + `flattenFeedPages`; poll one job with
  `generationQueryOptions`; read credit prices with `costQueryOptions`.
- After a run resolves, call `prependGenerations` so fresh work appears at the
  top of the grid; upload files with `useAttachments` and pass refs to
  `run.start`.
