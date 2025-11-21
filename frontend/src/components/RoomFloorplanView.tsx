import * as React from "react";
import { Box, CardMedia, Tooltip, Avatar } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import { Room, Seat } from "../types/events";
import { InvitationLiteData, RSVP } from "../types/invitations";

export interface SeatDisplayData {
  seat: Seat;
  occupants: InvitationLiteData[]; // Empty array for available seats
  isOwnSeat?: boolean; // For SeatSelector to mark user's seat
  isAvailable?: boolean; // For interactive selection
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

interface RoomFloorplanViewProps {
  room: Room;
  seats: SeatDisplayData[];
}

const DEFAULT_AVATAR_URL =
  "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

/**
 * RoomFloorplanView - Reusable component for rendering a room's floorplan with seat overlays
 * Used by SeatSelector (interactive), EventSeatMap (read-only), and WizardSeatSelector (interactive)
 */
const RoomFloorplanView: React.FC<RoomFloorplanViewProps> = ({
  room,
  seats,
}) => {
  const theme = useTheme();

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
            occupants,
            isOwnSeat,
            isAvailable,
            onClick,
            onKeyDown,
          } = seatData;

          const isOccupied = occupants.length > 0;
          const hasMultipleOccupants = occupants.length > 1;

          // Build tooltip
          const tooltipText = isOccupied
            ? hasMultipleOccupants
              ? `${seat.label} - ${occupants
                  .map((occ) => occ.handle || "Someone")
                  .join(", ")}`
              : `${seat.label} - ${occupants[0].handle || "Someone"}`
            : isOwnSeat
              ? `${seat.label} - Your seat`
              : `${seat.label}${
                  seat.description ? ` - ${seat.description}` : ""
                } - Available`;

          const ariaLabel = isOccupied
            ? hasMultipleOccupants
              ? `Seat ${seat.label} occupied by ${occupants.length} people`
              : `Seat ${seat.label} occupied by ${
                  occupants[0].handle || "Someone"
                }`
            : isOwnSeat
              ? `Seat ${seat.label} - Your seat`
              : `Seat ${seat.label} available`;

          // Determine presentation styles
          const styles = {
            backgroundColor: isOccupied
              ? "transparent"
              : isOwnSeat
                ? theme.palette.primary.main // User's selected seat
                : isAvailable !== undefined
                  ? isAvailable
                    ? theme.palette.success.main
                    : theme.palette.grey[500]
                  : theme.palette.success.main,

            color: isOccupied
              ? theme.palette.primary.main
              : theme.palette.common.white,
            cursor: onClick ? "pointer" : undefined,
            zIndex: 1,
          };

          const hoverTransform = onClick
            ? "translate(-50%, -50%) scale(1.1)"
            : undefined;

          return (
            <Tooltip key={seat.id} title={tooltipText} placement="top">
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
                tabIndex={onClick ? 0 : undefined}
                onKeyDown={onKeyDown}
              >
                {hasMultipleOccupants ? (
                  // Stacked avatars for multiple occupants
                  <Box
                    sx={{
                      position: "relative",
                      width: 44,
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {occupants.slice(0, 3).map((occupant, index) => {
                      const borderColor =
                        occupant.response === RSVP.yes
                          ? theme.palette.primary.main
                          : occupant.response === RSVP.maybe
                            ? theme.palette.warning.main
                            : theme.palette.primary.main;

                      const backgroundColor =
                        occupant.response === RSVP.yes
                          ? theme.palette.primary.dark
                          : occupant.response === RSVP.maybe
                            ? theme.palette.warning.dark
                            : theme.palette.primary.dark;

                      return (
                        <Avatar
                          key={index}
                          src={occupant.avatarUrl || DEFAULT_AVATAR_URL}
                          alt={occupant.handle || "Someone"}
                          sx={{
                            width: 30,
                            height: 30,
                            border: "2px solid",
                            borderColor,
                            backgroundColor,
                            position: "absolute",
                            left: `${index * 8}px`,
                            top: `${index * 2}px`,
                            zIndex: occupants.length - index,
                          }}
                        >
                          <PersonIcon sx={{ fontSize: "1rem" }} />
                        </Avatar>
                      );
                    })}
                  </Box>
                ) : isOccupied ? (
                  // Single occupant avatar
                  (() => {
                    const occupant = occupants[0];
                    const borderColor =
                      occupant.response === RSVP.yes
                        ? theme.palette.primary.main
                        : occupant.response === RSVP.maybe
                          ? theme.palette.warning.main
                          : theme.palette.primary.main;

                    const backgroundColor =
                      occupant.response === RSVP.yes
                        ? theme.palette.primary.dark
                        : occupant.response === RSVP.maybe
                          ? theme.palette.warning.dark
                          : theme.palette.primary.dark;

                    return (
                      <Avatar
                        src={occupant.avatarUrl || DEFAULT_AVATAR_URL}
                        alt={occupant.handle || "Someone"}
                        sx={{
                          width: 36,
                          height: 36,
                          border: "3px solid",
                          borderColor,
                          backgroundColor,
                        }}
                      >
                        <PersonIcon />
                      </Avatar>
                    );
                  })()
                ) : isOwnSeat ? (
                  // User's own seat (checkmark icon)
                  <CheckCircleIcon fontSize="small" />
                ) : (
                  // Available seat icon
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
