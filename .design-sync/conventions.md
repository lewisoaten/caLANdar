# caLANdar conventions

caLANdar is a dark, neon "gamer" UI built on **MUI (Material UI) v7**. There are no CSS classes or utility classes to learn: style through MUI props (`sx`, `variant`, `color`) and the theme palette.

## Wrap everything in the providers

Every component reads the MUI theme and most call react-router hooks (`useNavigate`, `useLocation`). Without the wrapper they render unstyled (white/Roboto) or throw "may be used only in the context of a <Router>". `theme`, `ThemeProvider`, `CssBaseline`, `SnackbarProvider`, `MemoryRouter` are all exports of `window.CaLANdar` (one shared copy; don't import MUI or react-router separately).

```jsx
const {
  theme,
  ThemeProvider,
  CssBaseline,
  SnackbarProvider,
  MemoryRouter,
  Box,
  Typography,
  RSVPSummary,
} = window.CaLANdar;

<ThemeProvider theme={theme}>
  <CssBaseline />
  <SnackbarProvider>
    <MemoryRouter>
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h5">Summer LAN Party</Typography>
        <RSVPSummary /* see RSVPSummary.prompt.md for props */ />
      </Box>
    </MemoryRouter>
  </SnackbarProvider>
</ThemeProvider>;
```

Do not nest a second Router (VerifyEmail included: it works inside the one above).

## Styling idiom: MUI theme, dark mode

- All of MUI (`Box`, `Stack`, `Typography`, `Button`, `Paper`, `Dialog`, ...) is on `window.CaLANdar` and picks up the theme. Lay out with `Box`/`Stack` and `sx` (spacing units `p: 3`, `gap: 2`).
- Palette (use as `color="primary"` or `sx={{ color: 'secondary.main', bgcolor: 'background.paper' }}`): `primary` violet #5F27DD, `secondary`/`info` neon cyan #08F7FE, `error` hot pink #F2059F, `warning` orange #FFA500, `success` neon green #51FF7E, `background.default` #16161a, `background.paper` #232946, `text.primary` white, `text.secondary` #d0d7f7, `divider` translucent violet.
- Font is **Montserrat** (shipped in `fonts/`, loaded via `styles.css`); do not set another family.
- Never hard-code hex colours that exist in the palette; use the tokens above.

## Where the truth lives

- `styles.css` and its `@import`s (fonts).
- `components/<group>/<Name>/<Name>.prompt.md` (usage + examples) and `<Name>.d.ts` (props) for each component.

## Signed-in user and data

- Components read the signed-in user from `UserContext` (`{ email, token, loggedIn, isAdmin }`): wrap with `<UserContext.Provider value={{ email: 'sam@example.com', token: 't', loggedIn: true, isAdmin: true }}>` for admin screens (`GamersAdmin`, `AuditLog`, `EventManagement`, the schedule's admin controls). Both `UserContext` and `UserDispatchContext` are on `window.CaLANdar`.
- Data-driven components call `/api/...` with `fetch` (`EventSelection`, `Account`, `GamersAdmin`, `AuditLog`, `EventAttendeeList`, `EventSeatMap`, `EventGameSchedule`, `EventManagement`, `InvitationSeatManagementTable`, `RoomManagerPanel`, `SeatList`, `FloorplanEditor`, ...). Without a backend they show empty/loading states: stub `window.fetch` for the paths named in each component's `.prompt.md`. Components that read `useParams()` (`EventSeatMap`, `EventGameSchedule`, `EventManagement`) must render under a `<Routes><Route path="/events/:id" element={...}/></Routes>` with the router at `/events/<id>`.
- Pure-props components (`GameScheduleDetails`, `GameOwners`, `GamesList`, `RoomFloorplanView`, `EventCard`, `RSVPSummary`, `AttendanceSelector`) need no data; see their `.prompt.md` for the prop shapes.
