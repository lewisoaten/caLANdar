import type { Meta, StoryObj } from "@storybook/react";
import EventAttendeeList from "../components/EventAttendeeList";
import { mockApi, withUser } from "./mockApi";

const invite = (
  eventId: number,
  handle: string,
  response: string,
  attendance: number[] | null,
) => ({
  eventId,
  avatarUrl: null,
  handle,
  response,
  attendance,
  seatId: null,
  lastModified: "2026-10-15T18:00:00",
});

// Each story owns an event id so the page-global fetch mocks never clash.
mockApi({
  // 311: mixed RSVPs
  "GET /api/events/311/invitations": [
    invite(311, "NightOwl", "yes", [1, 1, 1, 1, 1, 1, 1, 0]),
    invite(311, "FragQueen", "yes", [1, 0, 1, 1, 1, 0, 1, 0]),
    invite(311, "BigMike_NI", "yes", [1, 1, 1, 1, 1, 1, 0, 0]),
    invite(311, "PixelPete", "maybe", [0, 0, 1, 1, 1, 0, 0, 0]),
    invite(311, "LagLord", "maybe", [0, 0, 0, 1, 1, 0, 0, 0]),
    invite(311, "TankJoe", "no", null),
    invite(311, "SnipeyMcSnipeface", "yes", [1, 1, 0, 0, 1, 1, 0, 0]),
    invite(311, "CasualCarol", "no", null),
  ],
  // 312: long names
  "GET /api/events/312/invitations": [
    invite(
      312,
      "Sir_Reginald_Fragsworth_III_of_Ballymena",
      "yes",
      [1, 1, 1, 1, 1, 1, 1, 0],
    ),
    invite(
      312,
      "xX_DarkLord_Of_The_Rockets_Xx_2009",
      "maybe",
      [1, 0, 0, 1, 1, 0, 0, 0],
    ),
    invite(312, "Bartholomew-Cuthbertson-Hargreaves", "no", null),
    invite(312, "Zoe", "yes", [1, 1, 1, 1, 0, 0, 0, 0]),
  ],
  // 313: empty (responded, but nobody else invited)
  "GET /api/events/313/invitations": [],
  // 314: viewer has not RSVPed yet, list is locked
  "GET /api/events/314/invitations": [
    invite(314, "NightOwl", "yes", [1, 1, 1, 1, 1, 1, 1, 0]),
    invite(314, "FragQueen", "yes", [1, 0, 1, 1, 1, 0, 1, 0]),
  ],
});

const meta = {
  title: "Components/EventAttendeeList",
  component: EventAttendeeList,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [withUser({ isAdmin: false })],
} satisfies Meta<typeof EventAttendeeList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Yes, maybe and no responses side by side. `responded` unlocks the list. */
export const MixedRsvps: Story = {
  args: { event_id: 311, responded: 1 },
};

/** Very long gamer handles should wrap or truncate cleanly. */
export const LongHandles: Story = {
  args: { event_id: 312, responded: 1 },
};

/** RSVPed, but nobody else has been invited yet. */
export const NoOtherAttendees: Story = {
  args: { event_id: 313, responded: 1 },
};

/** Before the viewer RSVPs, the list is hidden behind a prompt and skeletons. */
export const NotRespondedYet: Story = {
  args: { event_id: 314, responded: 0 },
};
