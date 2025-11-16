import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { RSVPSummary } from "../components/RSVPWizard";
import { RSVP } from "../types/invitations";
import moment from "moment";

const meta = {
  title: "Components/RSVPSummary",
  component: RSVPSummary,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
  },
  args: {
    onEdit: fn(),
  },
} satisfies Meta<typeof RSVPSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotResponded: Story = {
  args: {
    invitation: {
      eventId: 1,
      email: "gamer@example.com",
      avatarUrl: null,
      handle: null,
      invitedAt: moment().subtract(3, "days"),
      respondedAt: null,
      response: null,
      attendance: null,
      lastModified: moment(),
    },
    disabled: false,
  },
};

export const RespondedYes: Story = {
  args: {
    invitation: {
      eventId: 1,
      email: "gamer@example.com",
      avatarUrl: null,
      handle: "ProGamer123",
      invitedAt: moment().subtract(3, "days"),
      respondedAt: moment().subtract(1, "days"),
      response: RSVP.yes,
      attendance: [1, 1, 1, 1, 0, 0, 0, 0],
      lastModified: moment().subtract(1, "days"),
    },
    disabled: false,
  },
};

export const RespondedMaybe: Story = {
  args: {
    invitation: {
      eventId: 1,
      email: "casual@example.com",
      avatarUrl: null,
      handle: "CasualGamer",
      invitedAt: moment().subtract(5, "days"),
      respondedAt: moment().subtract(2, "days"),
      response: RSVP.maybe,
      attendance: [1, 0, 1, 0, 0, 0, 0, 0],
      lastModified: moment().subtract(2, "days"),
    },
    disabled: false,
  },
};

export const RespondedNo: Story = {
  args: {
    invitation: {
      eventId: 1,
      email: "busy@example.com",
      avatarUrl: null,
      handle: "BusyPerson",
      invitedAt: moment().subtract(4, "days"),
      respondedAt: moment().subtract(1, "days"),
      response: RSVP.no,
      attendance: null,
      lastModified: moment().subtract(1, "days"),
    },
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    invitation: {
      eventId: 1,
      email: "gamer@example.com",
      avatarUrl: null,
      handle: "ProGamer123",
      invitedAt: moment().subtract(3, "days"),
      respondedAt: moment().subtract(1, "days"),
      response: RSVP.yes,
      attendance: [1, 1, 1, 1],
      lastModified: moment().subtract(1, "days"),
    },
    disabled: true,
  },
};
