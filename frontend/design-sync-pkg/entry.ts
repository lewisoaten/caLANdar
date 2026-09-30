// Library entry for design-sync: the app has no published package, so this
// re-exports the storied components (plus the theme) as one bundle surface.
export { default as theme } from "../src/theme";
export { default as AttendanceSelector } from "../src/components/AttendanceSelector";
export { default as Dashboard } from "../src/components/Dashboard";
export { default as EventGameSuggestions } from "../src/components/EventGameSuggestions";
export { default as EventTable } from "../src/components/EventTable";
export { default as EventsAdmin } from "../src/components/EventsAdmin";
export { default as EventsAdminDialog } from "../src/components/EventsAdminDialog";
export { default as InvitationsTable } from "../src/components/InvitationsTable";
export { default as MenuItems } from "../src/components/MenuItems";
export { default as RefreshGamesButton } from "../src/components/RefreshGamesButton";
export { default as SeatSelector } from "../src/components/SeatSelector";
export { default as SignIn } from "../src/components/SignIn";
export { default as VerifyEmail } from "../src/components/VerifyEmail";
export * from "../src/components/RSVPWizard";
// One shared copy of MUI + react-router for components, providers and stories
// (context identity). `Link` exists in both; the ambiguous name is dropped.
export * from "@mui/material";
export * from "react-router-dom";
