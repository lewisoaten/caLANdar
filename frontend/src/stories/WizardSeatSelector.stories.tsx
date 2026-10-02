import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import * as React from "react";
import Box from "@mui/material/Box";
import WizardSeatSelector from "../components/RSVPWizard/WizardSeatSelector";
import { RSVP, type InvitationLiteData } from "../types/invitations";
import { mockApi, stubImages, withUser } from "./mockApi";

stubImages();
import {
  designSeats,
  gamesRoom,
  mainHall,
  roomPhoto,
  stamp,
} from "./seatMapFixtures";

// Event ids 261-263 are reserved for these stories.
const occupant = (
  eventId: number,
  handle: string,
  seatId: number,
): InvitationLiteData => ({
  eventId,
  avatarUrl: null,
  handle,
  response: RSVP.yes,
  attendance: [1, 1, 1, 1],
  seatId,
  lastModified: stamp,
});

const register = (eventId: number, withSeats = true) => {
  const seats = withSeats ? designSeats(eventId) : [];
  const people = [
    occupant(eventId, "NoScope_Nia", 1),
    occupant(eventId, "CasualGamer", 5),
    occupant(eventId, "LagWizard", 6),
    occupant(eventId, "SamTheSniper", 9),
  ];
  mockApi({
    [`GET /api/events/${eventId}/rooms`]: withSeats
      ? [mainHall(eventId), gamesRoom(eventId, { backgroundUrl: roomPhoto })]
      : [],
    [`GET /api/events/${eventId}/seats`]: seats,
    [`GET /api/events/${eventId}/invitations`]: people,
    [`POST /api/events/${eventId}/seat-reservations/check-availability`]: {
      availableSeatIds: seats
        .filter((s) => !people.some((p) => p.seatId === s.id))
        .map((s) => s.id),
    },
  });
};
register(261);
register(262);
register(263, false);

/** Keeps the selection in state, like the wizard does. */
function Stateful(props: React.ComponentProps<typeof WizardSeatSelector>) {
  const [selected, setSelected] = React.useState(props.selectedSeatId);
  return (
    <WizardSeatSelector
      {...props}
      selectedSeatId={selected}
      onSeatSelect={(id, label, room) => {
        setSelected(id);
        props.onSeatSelect(id, label, room);
      }}
    />
  );
}

const meta = {
  title: "RSVP Wizard/WizardSeatSelector",
  component: WizardSeatSelector,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    withUser(),
    (Story) => (
      <Box sx={{ maxWidth: 640 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    eventId: 261,
    attendanceBuckets: [1, 1, 1, 1],
    selectedSeatId: null,
    reservedSeatId: null,
    onSeatSelect: fn(),
    allowUnspecifiedSeat: true,
    unspecifiedSeatLabel: "Unspecified Seat",
    disabled: false,
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof WizardSeatSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step 4 of the RSVP wizard: both rooms as floor plans plus "Bring my own seat". */
export const PickASeat: Story = {};

/** A seat already picked (cyan + glow, "Your pick"). */
export const SeatPicked: Story = { args: { eventId: 262, selectedSeatId: 3 } };

/** Seat required: no "Bring my own seat" option. */
export const SeatRequired: Story = {
  args: { eventId: 262, allowUnspecifiedSeat: false, selectedSeatId: 4 },
};

/** A custom label for the unspecified seat option. */
export const CustomOwnSeatLabel: Story = {
  args: { unspecifiedSeatLabel: "Somewhere near a plug socket" },
};

/** Disabled while the wizard saves. */
export const Disabled: Story = { args: { disabled: true, selectedSeatId: 2 } };

/** No rooms configured yet. */
export const NoSeats: Story = { args: { eventId: 263 } };
