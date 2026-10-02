import type { Meta, StoryObj } from "@storybook/react-vite";
import moment from "moment";
import { Box } from "@mui/material";
import EventsAdminDialog from "../components/EventsAdminDialog";
import { stubImages, withUser } from "./mockApi";

stubImages();

const event = {
  id: 501,
  title: "Autumn LAN 2026",
  description:
    "A weekend of games, pizza and questionable sleep schedules. Doors open Friday at 6pm, lights out (optional) Sunday afternoon.\nBring your rig, a long ethernet cable and a power strip.",
  image: undefined,
  timeBegin: moment("2026-10-16T18:00:00"),
  timeEnd: moment("2026-10-18T16:00:00"),
  createdAt: moment("2026-09-01T10:00:00"),
  lastModified: moment("2026-09-20T10:00:00"),
};

const meta = {
  title: "Components/EventsAdminDialog",
  component: EventsAdminDialog,
  parameters: {
    layout: "padded",
  },
  decorators: [
    withUser({ isAdmin: true }),
    (Story) => (
      <Box sx={{ maxWidth: 1100 }}>
        <Story />
      </Box>
    ),
  ],
  tags: ["autodocs"],
  argTypes: {
    open: { control: "boolean" },
  },
} satisfies Meta<typeof EventsAdminDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: {
    open: false,
    onClose: () => console.log("Dialog closed"),
  },
};

/** The modal create form (kept for callers that want a dialog). */
export const Open: Story = {
  args: {
    open: true,
    onClose: () => console.log("Dialog closed"),
  },
};

/** The inline new-event panel used on Manage events. */
export const InlineCreate: Story = {
  args: {
    open: true,
    variant: "inline",
    onClose: () => console.log("Form closed"),
  },
};

/** The Details tab of Event management: edit form plus cover image. */
export const InlineEdit: Story = {
  args: {
    open: true,
    variant: "inline",
    event,
    onClose: () => console.log("Saved"),
    onDelete: () => console.log("Delete"),
  },
};

/** End before start shows the validation message. */
export const InvalidRange: Story = {
  args: {
    open: true,
    variant: "inline",
    event: { ...event, timeEnd: moment("2026-10-15T18:00:00") },
    onClose: () => undefined,
    onDelete: () => undefined,
  },
};
