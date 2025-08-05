import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import EventsAdmin from "../components/EventsAdmin";
import React from "react";

const meta = {
  title: "Components/EventsAdmin",
  component: EventsAdmin,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Admin interface for managing events. Allows admins to view, create, and manage events in the system.",
      },
    },
    msw: {
      handlers: [
        // Mock events list
        {
          method: "GET",
          url: "/api/events",
          response: {
            status: 200,
            json: [
              {
                id: 1,
                title: "Summer LAN Party 2024",
                description: "Epic gaming weekend with friends",
                timeBegin: "2024-08-15T18:00:00Z",
                timeEnd: "2024-08-17T12:00:00Z",
                location: "Community Center",
              },
              {
                id: 2,
                title: "Winter Gaming Tournament",
                description: "Competitive gaming event",
                timeBegin: "2024-12-20T10:00:00Z",
                timeEnd: "2024-12-22T18:00:00Z",
                location: "Gaming Arena",
              },
            ],
          },
        },
        // Mock create event
        {
          method: "POST",
          url: "/api/events",
          response: {
            status: 201,
            json: {
              id: 3,
              title: "New Event",
              description: "Newly created event",
              timeBegin: "2024-09-01T10:00:00Z",
              timeEnd: "2024-09-02T18:00:00Z",
              location: "TBD",
            },
          },
        },
      ],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof EventsAdmin>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Default admin view showing the events table and create button.",
      },
    },
  },
};

export const WithManyEvents: Story = {
  parameters: {
    msw: {
      handlers: [
        {
          method: "GET",
          url: "/api/events",
          response: {
            status: 200,
            json: Array.from({ length: 10 }, (_, i) => ({
              id: i + 1,
              title: `Event ${i + 1}`,
              description: `Description for event ${i + 1}`,
              timeBegin: `2024-0${(i % 9) + 1}-01T10:00:00Z`,
              timeEnd: `2024-0${(i % 9) + 1}-02T18:00:00Z`,
              location: `Location ${i + 1}`,
            })),
          },
        },
      ],
    },
    docs: {
      description: {
        story: "Admin view with multiple events to show table pagination and scrolling.",
      },
    },
  },
};

export const EmptyState: Story = {
  parameters: {
    msw: {
      handlers: [
        {
          method: "GET",
          url: "/api/events",
          response: {
            status: 200,
            json: [],
          },
        },
      ],
    },
    docs: {
      description: {
        story: "Admin view when no events exist in the system.",
      },
    },
  },
};