import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import moment from "moment";
import SendEmailDialog from "../components/SendEmailDialog";
import { mockApi, withUser } from "./mockApi";

// Fixed weekend: Friday 13 Nov 2026 18:00 to Sunday 15 Nov 2026 12:00.
const event = {
  id: 331,
  title: "Autumn LAN: Rock and Stone",
  description: "Three days of co-op, RTS and late-night shooters.",
  image: undefined,
  timeBegin: moment("2026-11-13T18:00:00"),
  timeEnd: moment("2026-11-15T12:00:00"),
  createdAt: moment("2026-09-01T10:00:00"),
  lastModified: moment("2026-10-20T09:30:00"),
};

// The dialog posts on submit; answer with the API's 204 No Content.
// Invitations feed the audience chip counts.
const invitations = [
  ["nightowl@example.com", "yes"],
  ["fragqueen@example.com", "yes"],
  ["bigmike@example.com", "maybe"],
  ["casual@example.com", "no"],
  ["newbie@example.com", null],
  ["lurker@example.com", null],
].map(([email, response]) => ({
  eventId: 331,
  email,
  avatarUrl: null,
  handle: null,
  invitedAt: "2026-10-01T09:00:00Z",
  respondedAt: null,
  response,
  attendance: null,
  lastModified: "2026-10-01T09:00:00Z",
}));

mockApi({
  "POST /api/events/331/email": () => new Response(null, { status: 204 }),
  "POST /api/events/332/email": () => new Response(null, { status: 204 }),
  "GET /api/events/331/invitations": invitations,
  "GET /api/events/332/invitations": [],
});

const meta = {
  title: "Components/SendEmailDialog",
  component: SendEmailDialog,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
    event,
  },
  decorators: [withUser({ isAdmin: true })],
} satisfies Meta<typeof SendEmailDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Freshly opened: recipients default to "Going", subject and message empty. */
export const Open: Story = {};

/** Long event title in the intro copy. */
export const LongEventTitle: Story = {
  args: {
    event: {
      ...event,
      id: 332,
      title:
        "The Ballymena Great Autumn Bring-Your-Own-Computer Gaming Weekend and Charity Tournament 2026",
    },
  },
};

/** Subject and message filled in, ready to send. */
export const DraftReady: Story = {
  play: async ({ canvasElement }) => {
    // The dialog renders in a portal outside the story canvas.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await body.findByLabelText(/^Subject/),
      "Doors open at 18:00 on Friday",
    );
    await userEvent.type(
      await body.findByLabelText(/^Message/),
      "Bring your own keyboard, mouse and headset. Power strips and network cables are on us. Pizza arrives at 20:00.",
    );
  },
};

/** Inline form, as on the Broadcast tab of Event management. */
export const Inline: Story = {
  args: { variant: "inline" },
  parameters: { layout: "padded" },
};
