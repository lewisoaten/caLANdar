import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import { RSVPSummary } from "../components/RSVPWizard";
import { RSVP } from "../types/invitations";
import { withUser } from "./mockApi";
import { lobbyTimes, mockLobbyApi } from "./lobbyMocks";

// 951: seat A4 reserved; 952: own desk (unspecified); 953: no seating.
mockLobbyApi(951);
mockLobbyApi(952, { seatId: null });
mockLobbyApi(953, { hasSeating: false });

const mockEvent = (id = 951) => ({
  id,
  title: "Autumn LAN 2026",
  description: "Join us for an epic weekend of gaming!",
  timeBegin: moment(lobbyTimes.begin),
  timeEnd: moment(lobbyTimes.end),
  image: undefined,
  createdAt: moment(),
  lastModified: moment(),
});

/** The lobby's "Your RSVP" panel. */
const meta = {
  title: "Components/RSVPSummary",
  component: RSVPSummary,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [withUser({ email: "sam@example.com" })],
  argTypes: {
    disabled: { control: "boolean" },
  },
  args: {
    onEdit: fn(),
    event: mockEvent(),
  },
} satisfies Meta<typeof RSVPSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

const invitation = (
  response: RSVP | null,
  handle: string | null,
  attendance: number[] | null,
) => ({
  eventId: 951,
  email: "sam@example.com",
  avatarUrl: null,
  handle,
  invitedAt: moment().subtract(3, "days"),
  respondedAt: response ? moment().subtract(1, "days") : null,
  response,
  attendance,
  lastModified: moment().subtract(1, "days"),
});

export const NotResponded: Story = {
  args: { invitation: invitation(null, null, null), disabled: false },
};

export const RespondedYes: Story = {
  args: {
    invitation: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 1, 1, 0, 0]),
    disabled: false,
  },
};

export const RespondedMaybe: Story = {
  args: {
    invitation: invitation(RSVP.maybe, "CasualGamer", [1, 0, 1, 0, 0, 0, 0, 0]),
    disabled: false,
  },
};

export const RespondedNo: Story = {
  args: {
    invitation: invitation(RSVP.no, "BusyPerson", null),
    disabled: false,
  },
};

export const OwnDesk: Story = {
  args: {
    event: mockEvent(952),
    invitation: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 1, 1, 1, 1]),
  },
};

export const NoSeating: Story = {
  args: {
    event: mockEvent(953),
    invitation: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 1, 1, 1, 1]),
  },
};

/** The event has ended: RSVPs are closed. */
export const Disabled: Story = {
  args: {
    invitation: invitation(RSVP.yes, "ProGamer123", [1, 1, 1, 1, 0, 0, 0, 0]),
    disabled: true,
  },
};
