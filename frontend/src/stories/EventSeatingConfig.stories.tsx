import type { Meta, StoryObj } from "@storybook/react";
import moment from "moment";
import EventSeatingConfig from "../components/EventSeatingConfig";
import { EventSeatingConfig as SeatingConfig } from "../types/events";
import { mockApi, withUser } from "./mockApi";

const stamp = moment.utc("2026-02-20T09:00:00Z");

const config = (
  eventId: number,
  overrides: Partial<SeatingConfig>,
): SeatingConfig => ({
  eventId,
  hasSeating: true,
  allowUnspecifiedSeat: true,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: stamp,
  lastModified: stamp,
  ...overrides,
});

// The component reads and saves the same endpoint; PUT echoes the new config.
const register = (eventId: number, initial: SeatingConfig) =>
  mockApi({
    [`GET /api/events/${eventId}/seating-config`]: initial,
    [`PUT /api/events/${eventId}/seating-config`]: (req: {
      body: unknown;
    }) => ({
      ...initial,
      ...(req.body as object),
    }),
  });

register(211, config(211, {}));
register(212, config(212, { hasSeating: false }));
register(
  213,
  config(213, {
    allowUnspecifiedSeat: false,
    unspecifiedSeatLabel: "Unspecified Seat",
  }),
);
register(
  214,
  config(214, {
    unspecifiedSeatLabel:
      "I'll sit wherever there is a free plug socket and a decent chair",
  }),
);

const meta = {
  title: "Components/EventSeatingConfig",
  component: EventSeatingConfig,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    withUser({ isAdmin: true }),
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventSeatingConfig>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Seating on, with the "unspecified seat" option and its label enabled. */
export const SeatingEnabled: Story = {
  args: { eventId: 211 },
};

/** Seating off: the dependent controls are disabled. */
export const SeatingDisabled: Story = {
  args: { eventId: 212 },
};

/** Seating on, but attendees must pick a real seat. */
export const NoUnspecifiedOption: Story = {
  args: { eventId: 213 },
};

/** A very long custom label for the unspecified option. */
export const LongUnspecifiedLabel: Story = {
  args: { eventId: 214 },
};
