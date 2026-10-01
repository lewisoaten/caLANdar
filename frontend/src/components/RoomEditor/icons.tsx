import * as React from "react";
import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";
import EventSeatSharp from "@mui/icons-material/EventSeatSharp";
import TvSharp from "@mui/icons-material/TvSharp";
import DoorFrontSharp from "@mui/icons-material/DoorFrontSharp";
import OpenWithSharp from "@mui/icons-material/OpenWithSharp";
import CallMergeSharp from "@mui/icons-material/CallMergeSharp";
import CallSplitSharp from "@mui/icons-material/CallSplitSharp";
import type { Tool } from "./layout";

/** Material Symbols "arrow_selector_tool" (not in @mui/icons-material). */
export function SelectToolIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 3v16.2l4.3-4.3 2.7 6.1 2.8-1.2-2.7-6H19L6 3z" />
    </SvgIcon>
  );
}

/** Material Symbols "ink_eraser" style eraser (not in @mui/icons-material). */
export function EraseToolIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M15.1 3 22 9.9 12.9 19H20v2H7.1L2 15.9 15.1 3zm0 2.8L9.4 11.5l4.1 4.1 5.7-5.7-4.1-4.1zM8 12.9l-3.2 3.1 2.9 3h2.4l2-2L8 12.9z" />
    </SvgIcon>
  );
}

export const TOOL_ICONS: Record<Tool, React.ComponentType<SvgIconProps>> = {
  select: SelectToolIcon,
  move: OpenWithSharp,
  seat: EventSeatSharp,
  screen: TvSharp,
  entrance: DoorFrontSharp,
  merge: CallMergeSharp,
  split: CallSplitSharp,
  erase: EraseToolIcon,
};
