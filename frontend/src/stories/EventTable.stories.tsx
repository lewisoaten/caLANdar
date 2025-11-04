/* eslint-disable  @typescript-eslint/no-explicit-any */
import type { Meta, StoryObj } from "@storybook/react";
import { http, HttpResponse } from "msw";
import EventTable from "../components/EventTable";
import moment from "moment";

const meta = {
  title: "Components/EventTable",
  component: EventTable,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof EventTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockEvents = [
  {
    id: 1,
    title: "Summer LAN Party",
    description: "Annual summer gaming event",
    timeBegin: moment(),
    timeEnd: moment().add(2, "days"),
    createdAt: moment().subtract(7, "days"),
    lastModified: moment().subtract(1, "day"),
  },
  {
    id: 2,
    title: "Winter Championship",
    description: "Competitive gaming tournament",
    timeBegin: moment().add(30, "days"),
    timeEnd: moment().add(32, "days"),
    createdAt: moment().subtract(14, "days"),
    lastModified: moment().subtract(2, "days"),
  },
];

export const Default: Story = {
  args: {
    eventsState: [mockEvents, () => {}] as any,
    asAdmin: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events", () => {
          return HttpResponse.json(mockEvents);
        }),
      ],
    },
  },
};

export const AdminView: Story = {
  args: {
    eventsState: [mockEvents, () => {}] as any,
    asAdmin: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events", () => {
          return HttpResponse.json(mockEvents);
        }),
      ],
    },
  },
};

export const EmptyState: Story = {
  args: {
    eventsState: [[], () => {}] as any,
    asAdmin: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events", () => {
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};
