# HyperLAN design system

The shared foundation for the HyperLAN redesign: tokens, the MUI theme, the
primitives in this folder and the app shell. Screen code should look like the
`.dc.html` prototypes while using these parts instead of hard-coded values.

```tsx
import { Panel, PageHeader, Tag, HlPagination, hl } from "../components/hl";
```

Browse everything in Storybook under **HyperLAN/** (primitives plus a
**HyperLAN/Theme** page showing each themed MUI component) and **Shell/**.

## Tokens (`tokens.ts`)

| Token                                             | Value                                         | Use                                                                          |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `colors.bg`                                       | `#06070b`                                     | page background                                                              |
| `colors.surface`                                  | `rgba(12,15,24,.85)`                          | panels and cards                                                             |
| `colors.surfaceSolid`                             | `#0b0e16`                                     | dialogs, drawers, menus (also `palette.background.paper`)                    |
| `colors.surfaceFlat`                              | `#0c0f18`                                     | stat cells (surface flattened)                                               |
| `colors.text` / `text2` / `textMuted` / `textDim` | `#eef3ff` / `#c9d1e6` / `#a9b3cc` / `#7c87a6` | primary / strong secondary / body secondary / labels                         |
| `colors.cyan`                                     | `#36e6ff`                                     | primary, active, focus                                                       |
| `colors.violet` / `violetLight` / `violetText`    | `#8b5cff` / `#a58bff` / `#c4b2ff`             | **fills only** / borders / text                                              |
| `colors.lime` · `amber` · `pink` (`pinkText`)     | `#9dff5a` · `#ffc23d` · `#ff4d94` (`#ff7aae`) | success/live · warning/admin · danger                                        |
| `colors.gold` / `silver` / `bronze`               | `#ffd23d` / `#c9d3e6` / `#e8945a`             | vote trophies (`trophy[rank]`, `getTrophyColor`)                             |
| `colors.ink`                                      | `#06070b`                                     | text on any solid accent fill                                                |
| `hairline.faint/soft/chrome/panel/control/strong` | cyan at .07/.12/.14/.16/.25/.45               | row lines / dividers / sidebar+bar / panel border / inputs / outline buttons |
| `tint(name, alpha)`                               | `rgba(...)`                                   | tinted fills (`tint("cyan", .08)`)                                           |
| `tones[tone]`                                     | `{ fg, solid, border, fill }`                 | per-tone colours for `cyan violet lime amber pink neutral`                   |
| `fonts.ui` / `fonts.mono`                         | Chakra Petch / JetBrains Mono                 | self-hosted via `src/fonts.ts`                                               |
| `effects.glow` / `dialog` / `toast`               | box-shadows                                   | selected tile / dialogs / toasts                                             |
| `sectionGap`                                      | `clamp(18px,2.4vw,28px)`                      | gap between page blocks (the shell's `<main>` already uses it)               |
| `srOnly`                                          | sx object                                     | visually hidden, screen-reader visible                                       |

**Contrast rules** (checked in `src/__tests__/hlTokens.test.ts`, which fails on
any pair under 4.5:1): never use `violet` or `disabled` as text; on tinted
fills (`tint(...)` backgrounds) use `text`/`textMuted`/the tone's `fg`, not
`textDim`/`placeholder`. Add new pairs to `contrastPairs` when you introduce one.

## Theme highlights (`src/theme.ts`)

- Radius 0 everywhere; Chakra Petch UI, `h1`-`h4` uppercase (`h1` = `clamp(34px,4.4vw,52px)`).
  Extra Typography variants: `variant="kicker"` (11px mono label) and `variant="mono"`.
- `Button`: `contained` = chamfered solid (cut drawn on `::before`, so the focus
  ring is not clipped); `outlined` = 1px tone border over a faint tint;
  `text`. Sizes: small 44px, medium 48px, large 52px. Colour picks the tone:
  `primary` cyan, `warning` amber (admin CTAs), `success` lime, `error` pink,
  `secondary` violet, `inherit` neutral grey.
- `IconButton` is 44px minimum; ripples are off; every control has the 2px cyan
  `:focus-visible` ring (offset 2, or inset -2 inside lists).
- `Card` and `Paper variant="outlined"` = surface + hairline + corner bracket.
  Plain `Paper` is the solid surface (menus, popovers).
- Inputs (`TextField`, `Select`), `Dialog` (solid, cyan glow, blurred
  backdrop), `Drawer`, `Chip` (mono, square), `Tabs`, `Table` (mono dim
  headers), `Tooltip`, `Alert`, `LinearProgress`, `Pagination`,
  `Checkbox/Radio/Switch` (square HUD switch) and `Avatar` (chamfered) are all
  themed. (MUI X pickers / DataGrid are not dependencies.)
- Toasts: `enqueueSnackbar` as usual; `HlSnackbarProvider` (mounted in App)
  styles notistack: one width, bottom right (full width on mobile), stacked
  above the shell's bottom chrome via the `--hl-toast-bottom` CSS variable the
  shell sets (ticker 44px, mobile tab bar 64px + safe area).

## Patterns

- **Chamfered CTA**: `<Button variant="contained" size="large">Enter lobby</Button>`.
  For a custom element: `sx={{ clipPath: hl.chamfer(10) }}` (`hl.chamfer(24, "tr-bl")`
  for the hero/featured cards' opposite corners; `hl.chamferPct` for square tiles).
- **Panel with bracket**: `<Panel title="Squad" actions={…}>…</Panel>`, or on any
  element `sx={{ backgroundColor: hl.colors.surface, border: \`1px solid ${hl.hairline.panel}\`, ...hl.bracket() }}`
(`hl.bracket({ both: true, color: hl.colors.amber, size: 10 })`).
- **Tones**: pass `tone="lime"` etc. to `Tag`, `StatCell`, `Panel`, `Kicker`;
  status mapping used by the design: RSVP yes = lime, maybe = amber, no = pink,
  pending/needed = cyan, ended/past = neutral; admin = amber; suggested/taken = violet.
- **Responsive**: mobile is **<= 760px**. The theme's `md` breakpoint starts at
  761px, so `sx={{ flexDirection: { xs: "column", md: "row" } }}` or
  `theme.breakpoints.down("md")` target mobile. Use `useIsMobile()` only when the
  markup differs (drawer vs. bottom sheet). Grids: `repeat(auto-fill, minmax(min(100%, 300px), 1fr))`.
- **Lists**: search + `FilterChips` + list + `HlPagination`; reset page to 1 on any change.
- **Motion**: CSS animations are cut under `prefers-reduced-motion` globally;
  the ticker then renders a static, hand-scrollable list (no marquee).
  `usePrefersReducedMotion()` for JS motion.
  Keyframes available: `hlPulse` (status dots), `hlTick` (marquee).
- **Background FX**: `<BackgroundFx />` is rendered by the shell; toggle with
  `const { enabled, setEnabled, toggle } = useBackgroundFx()` (persisted in
  localStorage, default on). Pages should keep their own backgrounds transparent.
- Icons: `@mui/icons-material` **Sharp** variants only (`GridViewSharp`, ...).

## Primitives

| Component               | Key props                                                                                                                                                    | Notes                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`                 | `title?`, `kicker?`, `actions?`, `titleComponent="h2"`, `bracket="tl"\|"both"\|"none"`, `tone`, `padding="normal"\|"compact"\|"none"`, `component="section"` | labelled by its title                                                                                                               |
| `Kicker`                | `children`, `tone="dim"\|HlTone`, `prefix=true`, `component`                                                                                                 | `// ` prefix is aria-hidden                                                                                                         |
| `PageHeader`            | `title`, `kicker?`, `kickerTone?`, `description?`, `actions?`                                                                                                | renders the page's H1                                                                                                               |
| `Tag`                   | `children`, `tone`, `variant="outline"\|"solid"`, `dot?: boolean\|"pulse"`, `icon?`, `size="md"\|"sm"`                                                       | mono status label                                                                                                                   |
| `StatCell` / `StatGrid` | `value`, `label`, `tone="text"\|HlTone`, `size="md"\|"lg"`, `icon?` / `columns?`                                                                             | grid draws 1px hairlines between cells                                                                                              |
| `UserAvatar`            | `name`, `src?`, `size=36`, `decorative=true`                                                                                                                 | image or deterministic initials tile (`getInitials`, `avatarGradient`); set `decorative={false}` when no name is printed next to it |
| `HlPagination`          | `page` (1-based), `pageSize`, `total`, `onChange(page)`, `label="Pages"`                                                                                     | helpers `getPageItems`, `formatRange`, `pageCount`                                                                                  |
| `FilterChips`           | `options[{id,label,count?}]`, `label`, `value`, `onChange`, `multiple?`                                                                                      | buttons with `aria-pressed`                                                                                                         |
| `SearchField`           | `value`, `onChange(string)`, `label`, `placeholder?`, `icon?`, `clearable=true`                                                                              |                                                                                                                                     |
| `EmptyState`            | `title`, `description?`, `icon?`, `kicker?`, `action?`, `variant="plain"\|"panel"`                                                                           |                                                                                                                                     |
| `Countdown`             | `target` (Date/moment/ms/ISO), `variant="cells"\|"inline"`, `label`, `now?`, `doneContent?`                                                                  | pure helpers `splitCountdown`, `formatCountdown`, hook `useNow(ms)`                                                                 |
| `Trophy`                | `rank`, `size=20`, `decorative=false`                                                                                                                        | renders nothing outside 1-3                                                                                                         |
| `BrandMark`             | `size=32`, `wordmark=true`, `tagline?`                                                                                                                       | the "cL" tile + wordmark                                                                                                            |

## App shell

`components/Dashboard.tsx` (layout) + `components/MenuItems.tsx` (nav lists) +
`components/shell/` (`navModel.ts` pure route/breadcrumb/nav model,
`useShellState.ts` data, `EventStatus.tsx`, `navIcons.tsx`).

- Desktop: 256px sticky sidebar, 64px sticky top bar (breadcrumb + status pill),
  `<main id="main-content">` max 1400px wide, centred, padded, flex column with
  `sectionGap`. Pages should **not** add their own outer `Container`/margins.
- Mobile: top bar with brand + avatar menu button (bottom-sheet menu), fixed
  64px bottom tab bar on the four event pages only (elsewhere the sheet lists
  Events). `<main>` already reserves bottom space for it and the 44px ticker.
- Locked (RSVP-gated) nav items are `aria-disabled` buttons (focusable) with
  the reason linked by `aria-describedby` (`LockedNavButton`).
- `/admin/*` routes sit behind `AdminRoutes` (ProtectedRoutes.tsx): non-admins
  are redirected to `/events` with an "Admins only" toast.
- The live ticker (`ActivityTicker`) is rendered by the shell on the four event
  pages once the user has RSVP'd; pages must not render it themselves.
- The shell refetches the RSVP gate on the `calandar:rsvp-updated` window event.
- Sign-in (`/`) and verify pages render full-screen with no chrome.
