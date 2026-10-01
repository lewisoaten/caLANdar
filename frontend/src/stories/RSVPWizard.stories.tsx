import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import { RSVPWizard } from "../components/RSVPWizard";
import { RSVP } from "../types/invitations";
import { stubImages, withUser } from "./mockApi";
import { lobbyTimes, mockLobbyApi } from "./lobbyMocks";

stubImages();

// Seating events use 941, no-seating 942, seat-conflict 943.
mockLobbyApi(941);
mockLobbyApi(942, { hasSeating: false });
mockLobbyApi(943, { seatConflict: true, seatId: undefined });

/**
 * The RSVP wizard dialog: response -> attendance blocks -> callsign -> seat
 * (when the event has seating) -> review. Full-screen at <= 760px.
 */
const meta = {
  title: "Components/RSVPWizard",
  component: RSVPWizard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withUser({ email: "sam@example.com" })],
  argTypes: {
    open: { control: "boolean" },
  },
  args: {
    onClose: fn(),
    onSaved: fn(),
  },
} satisfies Meta<typeof RSVPWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockEvent = (id: number) => ({
  id,
  title: "Autumn LAN 2026",
  description: "Join us for an epic weekend of gaming!",
  timeBegin: moment(lobbyTimes.begin),
  timeEnd: moment(lobbyTimes.end),
  image: undefined,
  createdAt: moment(),
  lastModified: moment(),
});

const invitation = (
  response: RSVP | null,
  handle: string | null,
  attendance: number[] | null,
) => ({
  eventId: 941,
  email: "sam@example.com",
  avatarUrl: null,
  handle,
  invitedAt: moment().subtract(3, "days"),
  respondedAt: response ? moment().subtract(2, "days") : null,
  response,
  attendance,
  lastModified: moment().subtract(2, "days"),
});

/** First RSVP: nothing chosen yet. */
export const NewRSVP: Story = {
  args: { open: true, event: mockEvent(941), initialData: undefined },
};

export const EditExistingYes: Story = {
  args: {
    open: true,
    event: mockEvent(941),
    initialData: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 1, 1, 0, 0]),
  },
};

export const EditExistingMaybe: Story = {
  args: {
    open: true,
    event: mockEvent(941),
    initialData: invitation(
      RSVP.maybe,
      "CasualGamer",
      [1, 0, 1, 0, 0, 0, 0, 0],
    ),
  },
};

export const EditExistingNo: Story = {
  args: {
    open: true,
    event: mockEvent(941),
    initialData: invitation(RSVP.no, "BusyPerson", null),
  },
};

/** Event without seating: four steps, no seat picker. */
export const NoSeating: Story = {
  args: {
    open: true,
    event: mockEvent(942),
    initialData: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 1, 1, 1, 1]),
  },
};

/** Saving the seat fails with a 409: the toast shows the server's reason. */
export const SeatConflict: Story = {
  args: {
    open: true,
    event: mockEvent(943),
    initialData: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 1, 1, 1, 1]),
  },
};
