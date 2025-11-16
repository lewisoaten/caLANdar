import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { http, HttpResponse } from "msw";
import SeatSelector from "../components/SeatSelector";

// Mock data
const mockSeatingConfig = {
  eventId: 1,
  hasSeating: true,
  allowUnspecifiedSeat: true,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: "2025-01-15T10:00:00Z",
  lastModified: "2025-01-15T10:00:00Z",
};

const mockRooms = [
  {
    id: 1,
    eventId: 1,
    name: "Main Hall",
    description: "The main gaming hall",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    sortOrder: 0,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
  {
    id: 2,
    eventId: 1,
    name: "Side Room",
    description: "Quieter gaming area",
    image: null,
    sortOrder: 1,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
];

const mockSeats = [
  {
    id: 1,
    eventId: 1,
    roomId: 1,
    label: "A1",
    description: "Front row, left",
    x: 0.2,
    y: 0.3,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
  {
    id: 2,
    eventId: 1,
    roomId: 1,
    label: "A2",
    description: "Front row, center",
    x: 0.5,
    y: 0.3,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
  {
    id: 3,
    eventId: 1,
    roomId: 1,
    label: "A3",
    description: "Front row, right",
    x: 0.8,
    y: 0.3,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
  {
    id: 4,
    eventId: 1,
    roomId: 2,
    label: "B1",
    description: "Quiet corner",
    x: 0.3,
    y: 0.5,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
  {
    id: 5,
    eventId: 1,
    roomId: 2,
    label: "B2",
    description: "Quiet corner",
    x: 0.7,
    y: 0.5,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
];

const meta = {
  title: "Components/SeatSelector",
  component: SeatSelector,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [
        http.get("/api/events/:eventId/seating-config", () => {
          return HttpResponse.json(mockSeatingConfig);
        }),
        http.get("/api/events/:eventId/rooms", () => {
          return HttpResponse.json(mockRooms);
        }),
        http.get("/api/events/:eventId/seats", () => {
          return HttpResponse.json(mockSeats);
        }),
        http.get("/api/events/:eventId/seat-reservations/me", () => {
          return HttpResponse.json(null, { status: 404 });
        }),
        http.post(
          "/api/events/:eventId/seat-reservations/check-availability",
          () => {
            return HttpResponse.json({
              availableSeatIds: [1, 2, 3, 4, 5],
            });
          },
        ),
      ],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    eventId: {
      control: "number",
      description: "Event ID",
    },
    attendanceBuckets: {
      control: "object",
      description: "Array of attendance buckets (1=attending, 0=not)",
    },
    disabled: {
      control: "boolean",
      description: "Disable all interactions",
    },
  },
  args: {
    onReservationChange: fn(),
  },
} satisfies Meta<typeof SeatSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    eventId: 1,
    attendanceBuckets: [1, 1, 0, 0],
    disabled: false,
  },
};

export const NoAttendance: Story = {
  args: {
    eventId: 1,
    attendanceBuckets: null,
    disabled: false,
  },
};

export const WithReservation: Story = {
  args: {
    eventId: 1,
    attendanceBuckets: [1, 1, 0, 0],
    disabled: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/seating-config", () => {
          return HttpResponse.json(mockSeatingConfig);
        }),
        http.get("/api/events/:eventId/rooms", () => {
          return HttpResponse.json(mockRooms);
        }),
        http.get("/api/events/:eventId/seats", () => {
          return HttpResponse.json(mockSeats);
        }),
        http.get("/api/events/:eventId/seat-reservations/me", () => {
          return HttpResponse.json({
            id: 1,
            eventId: 1,
            seatId: 2,
            invitationEmail: "test@example.com",
            attendanceBuckets: [1, 1, 0, 0],
            createdAt: "2025-01-15T10:00:00Z",
            lastModified: "2025-01-15T10:00:00Z",
          });
        }),
        http.post(
          "/api/events/:eventId/seat-reservations/check-availability",
          () => {
            return HttpResponse.json({
              availableSeatIds: [1, 3, 4, 5],
            });
          },
        ),
      ],
    },
  },
};

export const Disabled: Story = {
  args: {
    eventId: 1,
    attendanceBuckets: [1, 1, 0, 0],
    disabled: true,
  },
};

export const LimitedAvailability: Story = {
  args: {
    eventId: 1,
    attendanceBuckets: [1, 1, 1, 1],
    disabled: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/seating-config", () => {
          return HttpResponse.json(mockSeatingConfig);
        }),
        http.get("/api/events/:eventId/rooms", () => {
          return HttpResponse.json(mockRooms);
        }),
        http.get("/api/events/:eventId/seats", () => {
          return HttpResponse.json(mockSeats);
        }),
        http.get("/api/events/:eventId/seat-reservations/me", () => {
          return HttpResponse.json(null, { status: 404 });
        }),
        http.post(
          "/api/events/:eventId/seat-reservations/check-availability",
          () => {
            return HttpResponse.json({
              availableSeatIds: [4, 5], // Only side room seats available
            });
          },
        ),
      ],
    },
  },
};

export const NoUnspecifiedSeat: Story = {
  args: {
    eventId: 1,
    attendanceBuckets: [1, 1, 0, 0],
    disabled: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/seating-config", () => {
          return HttpResponse.json({
            ...mockSeatingConfig,
            allowUnspecifiedSeat: false,
          });
        }),
        http.get("/api/events/:eventId/rooms", () => {
          return HttpResponse.json(mockRooms);
        }),
        http.get("/api/events/:eventId/seats", () => {
          return HttpResponse.json(mockSeats);
        }),
        http.get("/api/events/:eventId/seat-reservations/me", () => {
          return HttpResponse.json(null, { status: 404 });
        }),
        http.post(
          "/api/events/:eventId/seat-reservations/check-availability",
          () => {
            return HttpResponse.json({
              availableSeatIds: [1, 2, 3, 4, 5],
            });
          },
        ),
      ],
    },
  },
};
