import * as React from "react";
import { Box, CardMedia, Tooltip, Avatar } from "@mui/material";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import { Room, Seat } from "../types/events";

export interface SeatDisplayData {
  seat: Seat;
  tooltip: string;
  ariaLabel: string;
  onClick?: () => void;
  styles: {
    backgroundColor: string;
    border: string;
    color: string;
    cursor?: string;
    zIndex?: number;
  };
  hoverTransform?: string;
  icon: "seat" | "checkmark" | "avatar";
  avatarSrc?: string;
  avatarAlt?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

interface RoomFloorplanViewProps {
  room: Room;
  seats: SeatDisplayData[];
}

/**
 * RoomFloorplanView - Reusable component for rendering a room's floorplan with seat overlays
 * Used by both WizardSeatSelector (interactive) and EventSeatMap (read-only)
 */
const RoomFloorplanView: React.FC<RoomFloorplanViewProps> = ({
  room,
  seats,
}) => {
  if (!room.image) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "relative",
        mb: 2,
        paddingTop: "75%",
      }}
    >
      <CardMedia
        component="img"
        image={room.image}
        alt={`${room.name} floorplan`}
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
        }}
      />
      {/* Overlay seats on floorplan */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {seats.map((seatData) => {
          const {
            seat,
            tooltip,
            ariaLabel,
            onClick,
            styles,
            hoverTransform,
            icon,
            avatarSrc,
            avatarAlt,
            tabIndex,
            onKeyDown,
          } = seatData;

          return (
            <Tooltip key={seat.id} title={tooltip} placement="top">
              <Box
                onClick={onClick}
                sx={{
                  position: "absolute",
                  left: `${seat.x * 100}%`,
                  top: `${seat.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "auto",
                  minWidth: 44,
                  minHeight: 44,
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  transition: "all 0.2s",
                  "&:hover": hoverTransform
                    ? {
                        transform: hoverTransform,
                      }
                    : {},
                  ...styles,
                }}
                role={onClick ? "button" : "img"}
                aria-label={ariaLabel}
                tabIndex={tabIndex}
                onKeyDown={onKeyDown}
              >
                {icon === "avatar" && avatarSrc ? (
                  <Avatar
                    src={avatarSrc}
                    alt={avatarAlt || "User avatar"}
                    sx={{
                      width: 36,
                      height: 36,
                      border: "3px solid",
                      borderColor: "primary.main",
                    }}
                  >
                    <PersonIcon />
                  </Avatar>
                ) : icon === "checkmark" ? (
                  <CheckCircleIcon fontSize="small" />
                ) : (
                  <EventSeatIcon fontSize="small" />
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

export default RoomFloorplanView;
