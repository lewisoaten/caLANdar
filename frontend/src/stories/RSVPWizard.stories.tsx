import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { RSVPWizard } from "../components/RSVPWizard";
import { RSVP } from "../types/invitations";
import moment from "moment";

const meta = {
  title: "Components/RSVPWizard",
  component: RSVPWizard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
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

const mockEvent = {
  id: 1,
  title: "Summer LAN Party 2025",
  description: "Join us for an epic weekend of gaming!",
  timeBegin: moment().add(7, "days"),
  timeEnd: moment().add(9, "days"),
  image: undefined,
  createdAt: moment(),
  lastModified: moment(),
};

export const NewRSVP: Story = {
  args: {
    open: true,
    event: mockEvent,
    initialData: undefined,
  },
};

export const EditExistingYes: Story = {
  args: {
    open: true,
    event: mockEvent,
    initialData: {
      eventId: 1,
      email: "gamer@example.com",
      avatarUrl: null,
      handle: "ProGamer123",
      invitedAt: moment().subtract(3, "days"),
      respondedAt: moment().subtract(2, "days"),
      response: RSVP.yes,
      attendance: [1, 1, 1, 1, 0, 0, 0, 0],
      lastModified: moment().subtract(2, "days"),
    },
  },
};

export const EditExistingMaybe: Story = {
  args: {
    open: true,
    event: mockEvent,
    initialData: {
      eventId: 1,
      email: "casual@example.com",
      avatarUrl: null,
      handle: "CasualGamer",
      invitedAt: moment().subtract(5, "days"),
      respondedAt: moment().subtract(1, "days"),
      response: RSVP.maybe,
      attendance: [1, 0, 1, 0, 0, 0, 0, 0],
      lastModified: moment().subtract(1, "days"),
    },
  },
};

export const EditExistingNo: Story = {
  args: {
    open: true,
    event: mockEvent,
    initialData: {
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
  },
};
