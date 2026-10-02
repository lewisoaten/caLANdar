# caLANdar conventions

caLANdar uses the **HyperLAN** look: a dark HUD UI built on **MUI v7** plus a small set of custom primitives (`Panel`, `PageHeader`, `Tag`, ...). There are no CSS classes to learn: style with MUI props (`sx`, `variant`, `color`) and the HyperLAN tokens. Everything is on `window.CaLANdar` (one shared copy of React, MUI and react-router; don't import them separately).

## Wrap everything in the providers

Without `ThemeProvider` components render unstyled (white/Roboto); without a Router, components that call `useNavigate`/`useLocation` throw "may be used only in the context of a <Router>". `HlSnackbarProvider` styles toasts. Add `BackgroundFxProvider` + `<BackgroundFx />` only if you want the grid/glow backdrop.

```jsx
const { theme, ThemeProvider, CssBaseline, HlSnackbarProvider, MemoryRouter,
  Box, Panel, PageHeader, Tag, StatCell, StatGrid, EventCard } = window.CaLANdar;

<ThemeProvider theme={theme}>
  <CssBaseline />
  <HlSnackbarProvider>
    <MemoryRouter>
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: "clamp(18px,2.4vw,28px)" }}>
        <PageHeader kicker="Squad library" title="Games" description="What the squad owns." />
        <Panel title="Squad" actions={<Tag tone="lime" dot>Live</Tag>}>
          <StatGrid columns={2}>
            <StatCell value="6" label="Going" tone="lime" />
            <StatCell value="2" label="Maybe" tone="amber" />
          </StatGrid>
        </Panel>
      </Box>
    </MemoryRouter>
  </HlSnackbarProvider>
</ThemeProvider>;
```

Do not nest a second Router (stories like `VerifyEmail` and the page components work inside the one above). Dashboard (the app shell) brings its own layout: render pages inside `Dashboard` rather than adding outer margins/containers.

## Styling idiom: MUI theme + HyperLAN tokens

- Square corners everywhere (radius 0). `Button variant="contained"` is chamfered; `color` picks the tone: `primary` cyan, `secondary` violet, `success` lime, `warning` amber (admin CTAs), `error` pink. `Typography` has extra variants `kicker` (11px mono `// LABEL`) and `mono` (data); `h1`-`h4` are uppercase.
- Tokens are exported: `colors` (also `hl.colors`), `tint`, `hairline`, `fonts`, `sectionGap`. Page `colors.bg` #06070b, panels `colors.surface`, text `colors.text` / `textMuted` / `textDim`, primary `colors.cyan` #36e6ff, `lime` #9dff5a, `amber` #ffc23d, `pink` #ff4d94 (`pinkText` for body text), `violet` for fills only. Tinted fills: `sx={{ bgcolor: tint("cyan", 0.08) }}`.
- **Tones** (`cyan violet lime amber pink neutral`) go on `Tag`, `StatCell`, `Panel`, `Kicker`. Status mapping: RSVP yes = lime, maybe = amber, no = pink, pending/needed = cyan, ended/past = neutral, admin = amber, suggested/taken = violet.
- Never use `violet` or the disabled grey as text. Never hard-code hexes that exist as tokens.
- Fonts: Chakra Petch (UI) and JetBrains Mono (data, kickers), shipped in `fonts/` and loaded by `styles.css`; don't set another family.
- Mobile is <= 760px; MUI `md` starts at 761px, so `{ xs: "column", md: "row" }` targets mobile first.

## Primitives

`Panel` (title, kicker, actions, tone, bracket), `PageHeader` (title, kicker, description, actions), `Tag` (tone, variant outline|solid, dot), `Kicker`, `StatCell`/`StatGrid`, `UserAvatar` (name, src, size), `HlPagination` (page, pageSize, total, onChange), `FilterChips`, `SearchField`, `EmptyState`, `Countdown` (target, variant cells|inline), `Trophy` (rank 1-3), `BrandMark`. Props are in each `<Name>.d.ts`.

## Where the truth lives

- `styles.css` and its `@import`s (compiled component CSS + fonts).
- `components/<group>/<Name>/<Name>.prompt.md` (usage, examples, endpoints) and `<Name>.d.ts` (props).

## Signed-in user and data

- Components read the signed-in user from `UserContext` (`{ email, token, loggedIn, isAdmin }`): wrap with `<UserContext.Provider value={{ email: "sam@example.com", token: "t", loggedIn: true, isAdmin: true }}>` for screens that check `isAdmin` (`GamersAdmin`, `AuditLog`, `RoomEditor`, and the admin controls of `EventGameSchedule`). `UserContext` and `UserDispatchContext` are on `window.CaLANdar`.
- Most feature components call `/api/...` with `fetch` and show loading/empty/error states without a backend: stub `window.fetch` for the paths named in each component's `.prompt.md`. Components that read `useParams()` (`EventSeatMap`, `EventGameSchedule`, `EventManagement`, `Event`, `EventGames`, `RoomEditor`) must render under `<Routes><Route path="/events/:id" element={...}/></Routes>` with the router at `/events/<id>`.
