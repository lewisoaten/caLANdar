# design-sync notes (caLANdar)

## Setup

- App repo, not a package: `frontend/design-sync-pkg/` is a stub package (`entry.ts` re-exports the storied components + HyperLAN primitives + MUI + react-router-dom; `build-types.sh` runs tsc declarations + a vite lib build so svgr `.svg` imports compile). `buildCmd` runs it. Pass `--entry frontend/design-sync-pkg/dist/index.js --node-modules frontend/node_modules`.
- Adding a storied component = add its export to `entry.ts` (and a `titleMap` entry if the story title's last segment differs from the export name). Un-exported titles are dropped with `[TITLE_UNMAPPED]`. Stories that import *named* exports (helpers, `ActivityTickerView`, `OwnerChips`, `SteamGameCacheCard`, `FloorPlanLegend`, ...) need those exported too, or the preview renders `undefined`.
- [GENERAL] NixOS: playwright's chromium won't launch; set `DS_CHROMIUM_PATH` to your system Chrome/Chromium binary (e.g. `export DS_CHROMIUM_PATH="$(command -v google-chrome)"`).
- `cfg.provider` = ThemeProvider > CssBaseline > HlSnackbarProvider (mirrors `.storybook/preview.tsx`). The rest of the decorator (BackgroundFxProvider + MemoryRouter) is per-story, so it lives in the forked wrapper template `.design-sync/overrides/preview-gen-storybook.mjs` (declared in `cfg.libOverrides`): wraps every story in `BackgroundFxProvider` (`defaultEnabled` from `parameters.backgroundFx`) and a `MemoryRouter` unless `parameters.router === false`, and merges meta+story `parameters`. If `.storybook/preview.tsx` changes its decorators, update the fork and `cfg.provider` together.
- `storyImports.shim` routes story imports of `react-router-dom` / `@mui/material` to the single bundle copy (context identity).
- CSS comes from the compiled storybook CSS (`[CSS_FROM_STORYBOOK]`; there is no `dist/frontend.css`). Fonts (Chakra Petch, JetBrains Mono via `@fontsource`) ride along with it, so the reference storybook and the preview both have the brand fonts. Montserrat is gone from the app.
- `Button`/`Header` (Storybook boilerplate) and `HyperLAN/Theme` (docs only) are excluded via `titleMap: null`.
- `src/stories/mockApi.tsx`: stories use a page-level fetch fake (not MSW, which can't run in static previews). `stubImages()` swaps Steam covers / the default banner (`/static/lan_party_image.jpg`, a storybook staticDirs asset the preview doesn't serve) for SVGs and forces `loading=lazy` images eager. **Every story that renders images must call `stubImages()` at module level**, or (a) the default banner is a broken image in the preview and (b) `compare.mjs`'s `settleRender` waits forever on a lazy image that never decodes - the 2026-10 sync hung for 13 h on EventSeatMap this way. Check a new image-bearing story by loading its preview and calling `img.decode()` on every `document.images` with a timeout.
- Run the driver under `timeout 7200` so a stall can't go unnoticed.

## Capture viewport (full-page components)

Layouts with responsive breakpoints collapse in the narrow preview cell at the default 900x700 capture and are bottom-cropped, while storybook shows the full layout. That is framing, not a component bug: give the component `overrides.<Name>.viewport` ("WxH"). Set today: EventSeatMap 1280x1000, RoomEditor/WizardSeatSelector/Account 1280x1400, SeatOccupancyAdmin/InvitationSeatManagementTable 1280x1200, SignIn 1280x1000, Event/EventGames 1600x1400, EventsAdmin 1600x1000, VerifyEmail 1400x900, AuditLog 1100x1200, EventGameSchedule 1280x1600, GamesList 1280x1800, GamersAdmin 1280x1600, GameScheduleDetails 900x1100, EventManagement 1280x1400. Shell-wrapped page stories use `cardMode: "single"` + `primaryStory` (Account/EventsAdmin/EventGames `InShell`, Event `Lobby`, EventManagement `InShell`).

## Skipped stories (state only reachable via play() or MSW; static previews run neither)

- play()-driven: EventSelection AllEvents/PastEvents; GamersAdmin SearchByCallsign/StaleLibraries/NoResults/RefreshCache/Refreshing/RefreshFails/EditSteamId; InvitationSeatManagementTable SendInvitationsDialogOpen/RemoveConfirm; EventManagement DeleteConfirm; EventsAdmin NewEventOpen/DraftsOnly/NoMatches; SignIn LinkSent/InvalidEmail; AuditLog AllTime (plus the older AuditLog filtered/no-results).
- MSW-driven: EventSelection Loading/Empty/LoadError; RefreshGamesButton CacheCard/CacheCardRefreshed/CacheCardError (stats come from MSW handlers; the per-story overrides stop us moving them to mockApi). GamersAdmin's stats *were* moved into the story's `mockApi` table (all its stories share one response).
- Renders nothing by design / portal-only: Countdown Done, GameOwners NoOwnersHidden, RSVPWizard (all stories), SendEmailDialog (only `Inline` is captured), EventGameSuggestions Default, EventsAdminDialog Open/Closed, VerifyEmail WithToken (outer router has no token).
- Idea to recover the play-driven states: fork `story-imports.mjs` to bundle the real `storybook/test` (currently stubbed) and have the forked wrapper run each story's `play` after mount. Not attempted.

## Per-component gotchas

- GameCoverImage: owned `.design-sync/previews/GameCoverImage.tsx` calls `window.CaLANdar.markLegacyHeaderFailed/markResolvedCoverFailed` (exported from `entry.ts`) for the Fallback appid, because the story file bundles its own copy of `utils/gameCover` and its module-level side effects never reach the component's copy. Any story whose import-time side effects mutate a shared util has the same problem. Its RENDER_THIN "variants identical" warn is a false alarm; Trophy's RENDER_THIN is too (the paint is small SVG).
- Names ending in `Manager` are dropped by the converter (singleton heuristic) - none exported now.
- MenuItems: RENDER_THIN / identical-looking variants are expected (logged-out story renders blank in both panels).
- `playwright`'s compare caps at 6 stories per component (`[STORY_CAP]`); RoomEditor was run with `--max-stories 11`. Tail stories of other capped components (Dashboard, Event, EventManagement, EventGameSchedule, EventsAdmin, AuthHeroArt, SeatFloorPlan, EventSeatMap) are verified-by-upload only.
- [GENERAL] Don't `pkill -f` loose patterns from the shell tool: it matches its own command line. Use an anchored pattern (`^node \.ds-sync`).
- [GENERAL] A `package-build.mjs`/driver rebuild wipes `ds-bundle/_screenshots`; never rebuild while fan-out agents are grading, and tell agents to recapture their own components if sheets vanish.

## Re-sync risks

- Grades are judged against the storybook reference built from the same commit; rebuild `.design-sync/sb-reference` whenever stories or components change (`[REFERENCE_STALE?]`).
- `overrides/preview-gen-storybook.mjs` is a fork of the generator: a converter update that changes the wrapper template will not reach it. Diff against the bundled `lib/preview-gen-storybook.mjs` after skill updates.
- Skipped stories (above) are unverified; if a new story relies on `play()`/MSW it will show a wrong state and need a skip.
- Viewports were chosen by eye per component; a layout change can move a breakpoint.
- Accepted `close`: Event (all stories) - hero is a CSS `background-image: url(/static/lan_party_image.jpg)` hard-coded in `Event.tsx`; `stubImages()` only rewrites `<img>` and the design runtime doesn't serve `/static/`, so the preview hero is plain dark. Fixing needs an app change (use `DEFAULT_EVENT_IMAGE`/`eventImageSrc` with a data URL). EventTable `Narrow` was graded `close` by a fan-out agent - re-check on the next sync.
- `conventions.md` was rewritten for the HyperLAN redesign on the 2026-10 sync (names verified on `window.CaLANdar`); revalidate it when primitives or providers change.
- `.design-sync/previews/` holds only GameCoverImage; the old owned previews (EventSelection, EventManagement, GamersAdmin, InvitationSeatManagementTable) were deleted because their play() replays no longer matched the redesigned stories.
