import * as React from "react";
import { Box, CardMedia, Tooltip, Avatar } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import PersonIcon from "@mui/icons-material/Person";
import { Room, Seat } from "../types/events";

export interface SeatDisplayInfo {
  seat: Seat;
  isOccupied: boolean;
  isOwnSeat?: boolean;
  isAvailable?: boolean;
  occupantName?: string;
  occupantAvatar?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface SeatMapViewProps {
  room: Room;
  seats: SeatDisplayInfo[];
  onSeatClick?: (seatId: number) => void;
  showFloorplan?: boolean;
}

/**
 * SeatMapView - Reusable component for rendering a room's floorplan with seats
 * Can be used for read-only views, interactive selection, or editing
 */
const SeatMapView: React.FC<SeatMapViewProps> = ({
  room,
  seats,
  onSeatClick,
  showFloorplan = true,
}) => {
  const theme = useTheme();

  const getSeatVisualStyle = (seatInfo: SeatDisplayInfo) => {
    const { isOccupied, isOwnSeat, isAvailable, disabled } = seatInfo;

    if (isOwnSeat) {
      return {
        backgroundColor: "transparent",
        border: "none",
        color: theme.palette.secondary.main,
        opacity: 1,
      };
    }

    if (isOccupied) {
      return {
        backgroundColor: "transparent",
        border: "none",
        color: theme.palette.primary.main,
        opacity: 1,
      };
    }

    if (isAvailable) {
      return {
        backgroundColor: theme.palette.success.main,
        border: `2px solid ${alpha(theme.palette.success.dark, 0.35)}`,
        color: theme.palette.common.white,
        opacity: disabled ? 0.5 : 1,
      };
    }

    // Default/neutral state
    return {
      backgroundColor: theme.palette.grey[500],
      border: `2px solid ${alpha(theme.palette.common.black, 0.35)}`,
      color: theme.palette.common.white,
      opacity: 1,
    };
  };

  if (!showFloorplan || !room.image) {
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
          pointerEvents: "none",
        }}
      >
        {seats.map((seatInfo) => {
          const {
            seat,
            isOccupied,
            isOwnSeat,
            occupantName,
            occupantAvatar,
            onClick,
            disabled,
          } = seatInfo;
          const seatVisualStyle = getSeatVisualStyle(seatInfo);
          const isInteractive = onClick && !disabled;

          return (
            <Tooltip
              key={seat.id}
              title={
                isOccupied && occupantName
                  ? `${seat.label} - ${occupantName}`
                  : `${seat.label}${isOwnSeat ? " (Your seat)" : ""}${seat.description ? ` - ${seat.description}` : ""}${!isOccupied ? " - Available" : ""}`
              }
              placement="top"
            >
              <Box
                onClick={() => {
                  if (isInteractive) {
                    onClick();
                  }
                }}
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
                  cursor: isInteractive
                    ? "pointer"
                    : disabled
                      ? "not-allowed"
                      : "default",
                  pointerEvents: "auto",
                  minWidth: 44,
                  minHeight: 44,
                  zIndex: 1,
                  transition: "all 0.2s",
                  "&:hover": isInteractive
                    ? {
                        transform: "translate(-50%, -50%) scale(1.1)",
                      }
                    : {},
                  ...seatVisualStyle,
                }}
                role={isInteractive ? "button" : "img"}
                aria-label={
                  isOccupied && occupantName
                    ? `Seat ${seat.label} occupied by ${occupantName}`
                    : `Seat ${seat.label}${isOwnSeat ? " (your seat)" : isOccupied ? " (occupied)" : " (available)"}`
                }
                tabIndex={isInteractive ? 0 : -1}
                onKeyDown={
                  isInteractive
                    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onClick();
                        }
                      }
                    : undefined
                }
              >
                {isOccupied || isOwnSeat ? (
                  <Avatar
                    src={
                      occupantAvatar ||
                      "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                    }
                    alt={occupantName || "Occupant"}
                    sx={{
                      width: 36,
                      height: 36,
                      border: "3px solid",
                      borderColor: isOwnSeat
                        ? "secondary.main"
                        : "primary.main",
                    }}
                  >
                    <PersonIcon />
                  </Avatar>
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

export default SeatMapView;
