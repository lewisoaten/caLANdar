import type { SvgIconComponent } from "@mui/icons-material";
import GridViewSharp from "@mui/icons-material/GridViewSharp";
import SensorDoorSharp from "@mui/icons-material/SensorDoorSharp";
import SportsEsportsSharp from "@mui/icons-material/SportsEsportsSharp";
import EventSeatSharp from "@mui/icons-material/EventSeatSharp";
import ViewTimelineSharp from "@mui/icons-material/ViewTimelineSharp";
import PersonSharp from "@mui/icons-material/PersonSharp";
import TuneSharp from "@mui/icons-material/TuneSharp";
import GroupsSharp from "@mui/icons-material/GroupsSharp";
import ReceiptLongSharp from "@mui/icons-material/ReceiptLongSharp";
import type { NavKey } from "./navModel";

/** Material Symbols Sharp icon per nav destination (as in the design). */
export const NAV_ICONS: Record<NavKey, SvgIconComponent> = {
  events: GridViewSharp,
  lobby: SensorDoorSharp,
  games: SportsEsportsSharp,
  seatmap: EventSeatSharp,
  schedule: ViewTimelineSharp,
  account: PersonSharp,
  adminEvents: TuneSharp,
  gamers: GroupsSharp,
  audit: ReceiptLongSharp,
};
