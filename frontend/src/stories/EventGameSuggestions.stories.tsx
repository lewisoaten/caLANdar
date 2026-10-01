import type { Meta, StoryObj } from "@storybook/react-vite";
import EventGameSuggestions from "../components/EventGameSuggestions";
import { mockApi, stubImages, withUser } from "./mockApi";
import { mockLobbyApi } from "./lobbyMocks";

stubImages();

// 320: the lobby vote; 321: no suggestions yet.
mockLobbyApi(320);
mockApi({ "GET /api/events/321/suggested_games": [] });

/**
 * The lobby's game vote: ranked by votes with gold/silver/bronze trophies
 * for the top three (re-sorts as you vote), Steam search to suggest a game
 * with an optional pitch, and edit-your-pitch for your own suggestions.
 */
const meta = {
  title: "Components/EventGameSuggestions",
  component: EventGameSuggestions,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [withUser({ email: "sam@example.com" })],
  argTypes: {
    event_id: { control: "number" },
    responded: { control: "number" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof EventGameSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { event_id: 320, responded: 1, disabled: false },
};

export const NoSuggestions: Story = {
  args: { event_id: 321, responded: 1, disabled: false },
};

/** The viewer hasn't RSVP'd: the vote is locked. */
export const NotResponded: Story = {
  args: { event_id: 320, responded: 0, disabled: false },
};

/** The event has ended: voting and suggestions are closed. */
export const EventEnded: Story = {
  args: { event_id: 320, responded: 1, disabled: true },
};
