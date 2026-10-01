// Library entry for design-sync: the app has no published package, so this
// re-exports the storied components (plus the theme) as one bundle surface.
export { default as theme } from "../src/theme";
export { default as AttendanceSelector } from "../src/components/AttendanceSelector";
export { default as Dashboard } from "../src/components/Dashboard";
export { default as EventGameSuggestions } from "../src/components/EventGameSuggestions";
export { default as EventTable } from "../src/components/EventTable";
export { default as EventsAdmin } from "../src/components/EventsAdmin";
export { default as EventsAdminDialog } from "../src/components/EventsAdminDialog";
export { default as MenuItems } from "../src/components/MenuItems";
export { default as RefreshGamesButton } from "../src/components/RefreshGamesButton";
export { default as SignIn } from "../src/components/SignIn";
export { default as VerifyEmail } from "../src/components/VerifyEmail";

// Shared contexts/providers (single copy so stories and components agree).
export {
  UserContext,
  UserDispatchContext,
  UserProvider,
} from "../src/UserProvider";
export { SnackbarProvider } from "notistack";
export { default as Account } from "../src/components/Account";
export { default as AuditLog } from "../src/components/AuditLog";
export { default as EventAttendeeList } from "../src/components/EventAttendeeList";
export { default as EventCard } from "../src/components/EventCard";
export { default as EventGameSchedule } from "../src/components/EventGameSchedule";
export { default as EventManagement } from "../src/components/EventManagement";
export { default as EventSeatMap } from "../src/components/EventSeatMap";
export { default as EventSeatingConfig } from "../src/components/EventSeatingConfig";
export { default as EventSelection } from "../src/components/EventSelection";
export { default as RoomEditor } from "../src/components/RoomEditor/RoomEditor";
export { default as GameOwners } from "../src/components/GameOwners";
export { default as GameScheduleDetails } from "../src/components/GameScheduleDetails";
export { default as GamersAdmin } from "../src/components/GamersAdmin";
export { default as GamesList } from "../src/components/GamesList";
export { default as InvitationSeatManagementTable } from "../src/components/InvitationSeatManagementTable";
export { default as SendEmailDialog } from "../src/components/SendEmailDialog";
// One shared copy of MUI + react-router for components, providers and stories
// (context identity). `Link` exists in both; the ambiguous name is dropped.
export * from "@mui/material";
export * from "react-router-dom";
export * from "../src/components/RSVPWizard";
