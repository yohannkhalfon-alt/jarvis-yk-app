# Instructions for AI agents using `@higgsfield/quanta`

Canonical AI guide for generating code that consumes Quanta. Quanta is the
Higgsfield design system package: theme runtime, Tailwind token utilities, and
React components skinned with those tokens. Package/tool pointers should route
here first.

For modifying Quanta itself, also read
[`COMPONENT_STANDARD.md`](./COMPONENT_STANDARD.md). Source JSDoc, component
tests, and generated CSS are the executable spec.

## TL;DR rules

1. **Import the CSS once at the app root.**
   ```ts
   import '@higgsfield/quanta/theme.css'
   import '@higgsfield/quanta/primitives.css'
   import '@higgsfield/quanta/tailwind.css'
   ```
2. **Use public subpath imports only.** Example:
   `import { Button } from '@higgsfield/quanta/button'`. Never import from
   `src/components/*`.
3. **Use Quanta components before custom markup.** Button, Input, Modal,
   Dropdown, Command, Vault, Tabs, form controls, status, feedback, and display
   primitives are already available.
4. **Prefix design-semantic utilities with `q-`.** Use
   `bg-q-background-primary`, `text-q-body-md-regular`,
   `border-q-border-subtle`, `z-q-modal`.
5. **Spacing is native Tailwind scale, not old token numbers.** Use `p-4`,
   `gap-2`, `h-10`, `md:grid`. Do not use stale classes like `p-400`,
   `gap-200`, or `mt-300`.
6. **Use composite typography.** Use `text-q-headline-md-semi-bold`, not
   `text-2xl font-semibold`.
7. **Do not invent utilities or hardcode colors/sizes.** Check
   `src/css/tailwind/*.css` or ask for a token gap.
8. **Generated apps should look finished, not merely functional.** Build real
   layouts with clear hierarchy, breathing room, responsive constraints,
   empty/loading/error states, and polished control choices.

## Install and integration checklist

Quanta snapshots require:

- `@higgsfield/quanta`
- `@base-ui/react`
- `tailwindcss`
- React/Next/Vite app setup that processes package CSS

In a template or generated app, add Quanta CSS exactly once in the root CSS or
root client entry:

```ts
import '@higgsfield/quanta/theme.css'
import '@higgsfield/quanta/primitives.css'
import '@higgsfield/quanta/tailwind.css'
```

If components render without spacing, colors, or overlays, first check that
these CSS imports are present and loaded before app-specific overrides.

Use the runtime only on the client:

```tsx
import { ThemeController, bootstrapScript } from '@higgsfield/quanta/runtime'
```

Inject `bootstrapScript()` in the document head before first paint when the host
needs persisted theme/brand without flash. Instantiate `ThemeController`
client-side only.

## The `q-` namespace

Quanta shares a Tailwind build with legacy Higgsfield UI packages. To avoid
collisions, design-semantic utilities are prefixed with `q-`.

Use `q-` for:

| Category | Examples |
|---|---|
| Color | `bg-q-background-primary`, `text-q-text-secondary`, `border-q-border-subtle` |
| Typography | `text-q-headline-md-semi-bold`, `text-q-body-md-regular` |
| Z-index | `z-q-modal`, `z-q-toast` |
| Border width | `border-q-hairline` (0.5px), `border-q-thin`, `border-q-medium`, `border-q-thick` |
| Component internals | `q-button-*`, `q-menu-*`, `q-modal-*` |

Do not use `q-` for:

| Category | Examples |
|---|---|
| Spacing/sizing | `p-4`, `gap-2`, `w-80`, `h-10`, `inset-0` |
| Breakpoints | `md:`, `xl:` (or `q-tablet:`, `q-desktop:`, `q-wide:`) |
| Layout | `grid`, `flex`, `min-h-dvh`, `overflow-hidden` |

Rule of thumb: color, type, z-index, border-width, and component classes use
`q-`; spacing, layout, sizing, and breakpoints use native Tailwind.

## Utility quick reference

### Color

```txt
Surface:  bg-q-background-{primary,secondary,secondary-strong,tertiary,inverse,glass,elevated-start,elevated-end}
Text:     text-q-text-{primary,secondary,tertiary,inverse,disabled,link,brand,danger,success,warning,info,on-overlay-secondary,on-overlay-tertiary}
Border:   border-q-border-{default,subtle,strong,focus,error,warning,success,inverse}
State:    bg/text/border-q-state-{error,success,warning,info}-*
Brand:    bg/text/border-q-brand-{primary,blue,cyan,green,orange,pink,red,yellow,yellow-light}
```

Prefer semantic roles. Raw palette utilities are for Quanta internals only.

### Typography

Composite typography utilities include font size, line-height, font weight,
letter spacing, and font family where needed.

```txt
Roles:    display, headline, title, body, label, caption, mono, accent
Sizes:    lg, md, sm
Weights:  black, bold, semi-bold, medium, regular
```

Families per role: `display`/`headline`/`title` render Space Grotesk (the
brand headline face), `body`/`label`/`caption` render Inter, `accent` is
Space Grotesk bold (tight tracking; pair with `uppercase` for the hero/CTA
look), `mono` is IBM Plex Mono.

Good:

```tsx
<h1 className="text-q-display-md-bold">Studio</h1>
<h2 className="text-q-title-lg-semi-bold">Recent jobs</h2>
<p className="text-q-body-md-regular text-q-text-secondary">Ready to generate.</p>
```

Bad:

```tsx
<h1 className="text-5xl font-bold tracking-tight">Studio</h1>
```

### Spacing and breakpoints

Use native Tailwind spacing from the configured scale:
`0`, `0.5`, `1`, `1.5`, `2`, `2.5`, `3`, `4`, `5`, `6`, `7`, `8`, `10`,
`12`, `14`, `16`, `20`, `24`.

Examples: `p-6`, `px-4`, `gap-3`, `space-y-4`, `h-10`, `w-80`.

Breakpoints are mobile-first. Quanta ships three named variants (see
`src/css/tailwind/breakpoint.css`): `q-tablet:` (48rem), `q-desktop:` (80rem),
`q-wide:` (120rem). Tailwind's default `sm:`/`md:`/`lg:`/`xl:`/`2xl:` variants
also work. There are no `tablet:`/`desktop:`/`wide:` variants.

## Component catalog

Import every component by subpath:

```tsx
import { Button } from '@higgsfield/quanta/button'
import { Input } from '@higgsfield/quanta/input'
import { Textarea } from '@higgsfield/quanta/textarea'
import { Modal } from '@higgsfield/quanta/modal'
```

### Actions and navigation

| Component | Import | Use |
|---|---|---|
| `Button`, `button` | `@higgsfield/quanta/button` | Primary/secondary actions, links with `as="a"`, trigger composition with `asChild` |
| `NavigationMenu` | `@higgsfield/quanta/navigation-menu` | Product nav, app top nav, grouped menus |
| `Sidebar` | `@higgsfield/quanta/sidebar` | Product navigation rail — header switcher, sections, composite `Item` rows (`ItemIcon`/`ItemLabel`/`ItemMeta`/`ItemEnd`), built-in collapse (`Toggle`) |
| `Tabs` | `@higgsfield/quanta/tabs` | View switching, segmented controls, modal header tabs |
| `Dropdown` | `@higgsfield/quanta/dropdown` | Menus, model pickers, searchable selection, submenus |
| `Command` | `@higgsfield/quanta/cmdk` | Command palette, quick switchers, keyboard-first search |
| `ButtonGroup`, `buttonGroup` | `@higgsfield/quanta/button-group` | Segmented action clusters and icon toolbars — propagates `size`/`variant`, `attached` joins, `orientation` stacks |

Button variants:

- Product actions: `primary`, `secondary`, `tertiary`, `outline`, `ghost`, `brandSoft`
  — variant colors do NOT follow the token names: `primary` = flat lime,
  `secondary` = solid white, `tertiary` = dark white/10 glass. In this
  template's apps, ordinary/navigation actions use the dark
  `tertiary`/`ghost`; generation CTAs use `marketingPrimary`
- Destructive: `danger`, `dangerSoft`
- Marketing: `marketingPrimary`, `marketingSecondary`,
  `marketingTertiary`, `marketingGhost`
- Special accents: `specialBrand`, `specialPink`

Use `iconOnly` only for true icon buttons with an accessible label.

### Forms and controls

| Component | Import | Use |
|---|---|---|
| `Input` | `@higgsfield/quanta/input` | Labelled single-line fields, helper/error text, prefix/suffix icons |
| `Textarea` | `@higgsfield/quanta/textarea` | Labelled multi-line fields, prompts, comments, notes |
| `Select` | `@higgsfield/quanta/select` | Single/multiple choice from a known option set — field-styled trigger, grouped glass popup, leading icons/badges; selected row highlights; `connected` on `Root` nests the field inside a wider popup that overlaps behind it (min-width floored) |
| `Autocomplete` | `@higgsfield/quanta/autocomplete` | Type-to-filter selection — search input + filtered glass list, rich item rows, clear affix, empty state; `connected` on `Root` nests the input inside a wider popup that overlaps behind it (input stays on top + typable) |
| `Checkbox`, `CheckboxLabel` | `@higgsfield/quanta/checkbox` | Multi-select booleans and labelled checkbox rows |
| `RadioGroup`, `Radio`, `RadioLabel` | `@higgsfield/quanta/radio` | Exclusive choices |
| `Switch` | `@higgsfield/quanta/switch` | Binary settings that apply immediately |
| `Slider` | `@higgsfield/quanta/slider` | Stepped or continuous numeric settings |
| `Toggle` | `@higgsfield/quanta/toggle` | Pressed/unpressed toolbar controls |
| `Chip` | `@higgsfield/quanta/chip` | Compact selectable/filter-like chips |

Use the dedicated control for the setting shape. Do not model binary settings
as a `Button`; use `Switch`, `Checkbox`, or `Toggle`.

### Overlays and feedback

| Component | Import | Use |
|---|---|---|
| `Modal` | `@higgsfield/quanta/modal` | Centered dialogs, confirmation, editors, complex panels |
| `Vault` | `@higgsfield/quanta/vault` | Edge-docked drawer/sheet, especially mobile or tool panels |
| `Toaster`, `toast` | `@higgsfield/quanta/sonner` | App-root toast viewport and imperative notifications |
| `Progress` | `@higgsfield/quanta/progress` | Bar, line, dots, determinate/indeterminate progress |
| `Loader` | `@higgsfield/quanta/loader` | Indeterminate spinner — dots/circle/stars/shine, slot-tinted |
| `Tooltip` | `@higgsfield/quanta/tooltip` | Hover/focus hint popup — small inverted surface, optional arrow, `Provider` shares delay |
| `CloseButton`, `closeButton` | `@higgsfield/quanta/close-button` | Round dismiss for overlays; recipe styles a framework close part |

Mount one `Toaster` near the app root before calling `toast.*`.

### Display primitives

| Component | Import | Use |
|---|---|---|
| `Avatar` | `@higgsfield/quanta/avatar` | User/workspace identity, presence |
| `Badge`, `badge` | `@higgsfield/quanta/badge` | New/pro/status marker |
| `Tag` | `@higgsfield/quanta/tag` | Removable categories or model metadata |
| `Dot` | `@higgsfield/quanta/dot` | Presence/status point |
| `Kbd`, `KbdSequence` | `@higgsfield/quanta/kbd` | Keyboard shortcuts |
| `Divider` | `@higgsfield/quanta/divider` | Structural separators |
| `NotFound` | `@higgsfield/quanta/not-found` | Empty/not-found states where available |
| `Accordion` | `@higgsfield/quanta/accordion` | Expandable content sections — single/multiple open, `list`/`separated` surface, `sm`/`md`/`lg` size (scales padding, radius, type) |
| `Icon`, `icon` | `@higgsfield/quanta/icon` | Render an icon glyph at a token `size`/`color` (`as={SomeIcon}`); `icon()` recipe styles a non-Icon element |
| `Typography`, `typography` | `@higgsfield/quanta/typography` | Semantic text as a component — `variant` (display/headline/title/body/label/caption/mono/accent + size/weight) + `color`; the component form of the `text-q-*` utilities |

### Layout and surfaces

| Component | Import | Use |
|---|---|---|
| `Grid` | `@higgsfield/quanta/grid` | Responsive grids — fixed/`auto-fit`/`auto-fill` columns, `minColWidth`, `gap`, `Grid.Item` `colSpan`/`rowSpan`; `animate` FLIP-animates reflow/reorder/filter (per-cell `flipKey`) |
| `VirtualGrid` | `@higgsfield/quanta/grid` | Windowed, data-driven grid for big feeds & galleries — `items`+`renderItem`, `overscan`, fixed `cols` or responsive `minColWidth`, uniform `rowHeight`. Pair with `Media.Video autoPlayInView`. Also exports `useInView`/`useGridVirtualizer` |
| `Media` | `@higgsfield/quanta/media` | Fixed-ratio image/video tiles — `ratio`/`fit`/`rounded`, `Overlay`/`Caption`/`Fallback` parts, `useMediaFallback` onError flow; `Media.Video autoPlayInView` plays (muted) only while on screen |
| `Glass`, `glass` | `@higgsfield/quanta/glass` | Real frosted-glass surface — backdrop blur+saturate, specular edge + top sheen; pin over colorful media |
| `Card`, `card` | `@higgsfield/quanta/card` | Glass/solid content surface — `Header`/`Body`/`Footer` parts, `surface` glass\|solid, `elevation` flat\|raised; `card()` recipe |

## Component recipes

### Modal

```tsx
<Modal.Root>
  <Modal.Trigger render={<Button variant="secondary">Open</Button>} />
  <Modal.Content size="lg">
    <Modal.Header title="Edit settings" />
    <Modal.Body>
      <Modal.Workspace>
        <Input label="Name" />
      </Modal.Workspace>
    </Modal.Body>
    <Modal.Footer actions={<Button>Save</Button>} />
  </Modal.Content>
</Modal.Root>
```

Use `Modal.Workspace` for the inset frosted pane inside modal bodies. For split
layouts, place multiple workspaces inside your own `flex` or `grid`.

### Command palette

```tsx
<Command.Dialog shortcut="mod+k" label="Command menu">
  <Command.Input placeholder="Search actions..." />
  <Command.List>
    <Command.Empty>No results.</Command.Empty>
    <Command.Group heading="Actions">
      <Command.Item
        title="New project"
        subtitle="Create a fresh workspace"
        onSelect={createProject}
      />
    </Command.Group>
  </Command.List>
</Command.Dialog>
```

Use `Command.Body`, `Command.Detail`, `Command.Footer`, and `Command.Action`
for two-pane palettes.

### Vault drawer

```tsx
<Vault.Root side="bottom">
  <Vault.Trigger render={<Button variant="secondary">Filters</Button>} />
  <Vault.Content>
    <Vault.Header title="Filters" />
    <Vault.Body>...</Vault.Body>
    <Vault.Footer actions={<Button>Apply</Button>} />
  </Vault.Content>
</Vault.Root>
```

Use `Vault` for drawers/sheets. Use `Modal` for centered dialogs.

## Premium layout rules for generated apps

These rules matter for app generation. Quanta supplies components and tokens;
agents must still compose them into a real product layout.

1. **Start with the real app surface, not a marketing page.** If the prompt asks
   for a tool, editor, dashboard, feed, notes app, generator, or workspace,
   make that tool the first viewport.
2. **Use stable shell structure.** App-like products usually need a root shell:
   `min-h-dvh`, optional sidebar, main work area, and constrained scroll
   regions. No app header/top bar — marketplace apps render inside Higgsfield,
   whose chrome provides the global header; a page title is a heading inside
   the work area. Avoid content floating in random page space.
3. **Give layouts breathing room.** Use `p-4` to `p-8`, `gap-3` to `gap-6`, and
   visible hierarchy. A screen where all text hugs borders looks unfinished.
4. **Use professional type scale.** Page titles normally use
   `text-q-title-lg-semi-bold` or `text-q-headline-md-semi-bold`; body text uses
   `text-q-body-md-regular`; metadata uses `text-q-caption-sm-medium`. Do not
   make every label the same size.
5. **Choose the correct control.** Icons for icon-only actions, `Button` for
   commands, `Tabs` for modes, `Dropdown` for option sets, `Switch`/`Checkbox`
   for booleans, `Slider` for ranges, `Input` for typed values.
6. **Do not nest cards inside cards.** Use full-width bands, shells, sidebars,
   workspaces, or repeated item cards. Avoid decorative card-on-card layouts.
7. **Make empty/loading/error states first-class.** Use `Progress`, `Tag`,
   `Badge`, `NotFound`, and clear local state surfaces rather than blank panels.
8. **Keep text inside containers.** Use `min-w-0`, `truncate`, responsive grids,
   and fixed control dimensions where needed.
9. **Dark surfaces need contrast.** Pair `bg-q-background-primary` with nested
   `bg-q-background-secondary` or component surfaces, and use subtle borders.
10. **No arbitrary brand decoration.** Do not add gradient orbs, random blur
    blobs, raw purple/blue gradients, or stock-looking illustration unless the
    product prompt explicitly calls for it.

## Runtime API rules

- `bootstrapScript()` returns a plain JS string. Inject it synchronously in
  `<head>` before first paint when the host wants persisted theme without flash.
- `ThemeController` uses `localStorage` and `matchMedia`. Instantiate it on the
  client only.
- `readInitialThemeState()` is SSR-safe for lazy React state initialization.
- `defineTheme()` plus `setOverride()` supports dynamic themes. Clear overrides
  with `setOverride(null)`.
- Do not mutate `document.documentElement.dataset.theme` directly while a
  controller is active. Use `setPref()`, `setBrand()`, or `setOverride()`.

## Anti-patterns

### Do not forget the `q-` prefix for semantic utilities

```tsx
<div className="bg-background-primary text-text-primary" />      // bad
<div className="bg-q-background-primary text-q-text-primary" />  // good
```

### Do not use stale numeric token classes for spacing

```tsx
<main className="px-400 py-300 gap-200" /> // bad
<main className="px-4 py-3 gap-2" />       // good
```

### Do not split typography into Tailwind size and weight

```tsx
<h2 className="text-2xl font-bold" />             // bad
<h2 className="text-q-title-lg-semi-bold" />      // good
```

### Do not hand-roll components that already exist

```tsx
<button className="rounded-lg bg-lime-400 px-4 py-2">Save</button> // bad
<Button variant="secondary">Save</Button>                          // good
```

### Do not expose Quanta internals as app API

`q-button-*`, `q-menu-*`, `q-modal-*`, and similar classes exist so Quanta
components can render. App code should use components and recipe helpers such
as `button()` only when styling a non-button trigger.

## Component override tokens

A generated tier of GLOBAL component-dimension knobs is published on `:root` in
`src/css/components/component.css` (codegen output of `tokens/component.json`,
emitted by `scripts/tokens-emit/lib/emit/component.ts`). These are the
single-value sizing defaults a consumer would set to resize a component — NOT
per-variant color/state logic, which stays inline in each component's CSS.

| Token | Default | Resizes |
|---|---|---|
| `--q-modal-width` | `40rem` | Modal popup width |
| `--q-modal-width-{xs,sm,md,lg,xl,2xl}` | `21.8125rem`…`87rem` | Modal `size` variant widths |
| `--q-menu-min-width` | `160px` | Dropdown/menu min width |
| `--q-menu-max-width` | `400px` | Dropdown/menu max width |
| `--q-sidebar-width` | `14.9375rem` | Sidebar rail width |
| `--q-sidebar-width-collapsed` | `3.25rem` | Collapsed sidebar rail width |
| `--q-nav-col-width` | `192px` | NavigationMenu legacy column width |
| `--q-slider-width` | `11.5rem` | Slider track width |
| `--q-sonner-width` | `22.5rem` | Toast viewport width |
| `--q-vault-width` | `22rem` | Vault drawer width |
| `--q-textarea-min-height` | `10.25rem` | Textarea min height |

To resize component X, set its `--q-<comp>-<dim>` on an ancestor (or the
component instance) — the closer scope wins the cascade, and that override IS
the mechanism. Example:

```tsx
// Wider modal for one screen — no prop, no custom CSS, just override the knob.
<div style={{ '--q-modal-width': '52rem' }}>
  <Modal.Root>…</Modal.Root>
</div>
```

Do not hardcode these dimensions inline in component CSS — reference the
generated `--q-<comp>-<dim>` so the override knob stays live.

## Extending Quanta

When adding or refactoring components:

1. Read `ai/COMPONENT_STANDARD.md`.
2. Keep the package shape:
   `src/components/<name>/<name>.tsx`, `<name>.css`, `<name>.test.tsx`,
   `index.ts`.
3. Add the component stylesheet to `src/css/tailwind/components.css`.
4. Use Base UI primitives for behavior when available.
5. Keep all public types exported from the component `index.ts`.
6. Update this guide when a component becomes part of the recommended app
   generation surface.

Focused package checks:

```sh
yarn workspace @higgsfield/quanta test
yarn workspace @higgsfield/quanta typecheck
```

Do not run the full app build, `next build`, or `ci:build` in this workspace.

## When in doubt

1. Check `src/components/<component>/index.ts` for public exports.
2. Read the component JSDoc.
3. Check `src/css/tailwind/*.css` for utility names.
4. Read `ai/COMPONENT_STANDARD.md` before changing Quanta internals.
5. Ask for a design-token gap instead of inventing a class or hardcoded value.
