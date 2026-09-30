# design-sync notes (caLANdar)

- App repo, not a package: `frontend/design-sync-pkg/` is a stub package (entry.ts re-exports the storied components + MUI + react-router-dom; `build-types.sh` runs tsc declarations + a vite lib build so svgr `.svg` imports compile). `buildCmd` runs it. `--entry frontend/design-sync-pkg/dist/index.js`.
- [GENERAL] NixOS: playwright's chromium won't launch; set `DS_CHROMIUM_PATH` to the system google-chrome.
- [GENERAL] `.storybook/preview` decorators bundle a second copy of MUI/router (CssBaseline renders undefined) -> `cfg.provider` = ThemeProvider > CssBaseline > MemoryRouter, all from the single bundle copy; `storyImports.shim` routes story imports of MUI/react-router-dom to the same copy (context identity).
- Added a global MemoryRouter decorator to `.storybook/preview.tsx` (stories were broken without a Router); VerifyEmail sets `parameters.router=false` and its wrapper skips its own router when already inside one. Its WithToken story is skipped for design-sync (outer router has no token).
- Montserrat woff2/ttf vendored in `design-sync-pkg/fonts` (app loads it from Google Fonts in index.html); repo Storybook doesn't load it, so previews show brand font where storybook shows a fallback.
- Button/Header (Storybook boilerplate) excluded via titleMap null.
- Skipped, unverifiable (MSW/network-driven or portal stories the reference can't render): SeatSelector, RSVPWizard, EventsAdminDialog (all stories), EventGameSuggestions, InvitationsTable data stories.

## Re-sync risks
- Card grades judged against a storybook without the brand font.
- Skipped components ship floor cards until MSW-backed data can render in previews.
- InvitationsTable: owned preview swallows the unhandled rejection from the un-mocked /api fetch (only Empty State is graded; data stories skipped).
