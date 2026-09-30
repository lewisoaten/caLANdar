import type { Meta, StoryObj } from "@storybook/react-vite";
import moment from "moment";
import EventCard from "../components/EventCard";
import { stubImages } from "./mockApi";

const base = {
  id: 101,
  createdAt: moment("2030-01-10T09:00:00Z"),
  lastModified: moment("2030-02-01T09:00:00Z"),
  image: undefined,
};

stubImages();

const meta = {
  title: "Components/EventCard",
  component: EventCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EventCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {
  args: {
    event: {
      ...base,
      title: "Summer LAN Party 2031",
      description:
        "Three days of Counter-Strike, Rocket League and questionable pizza. Bring your own rig, headset and extension lead.",
      timeBegin: moment("2031-07-18T18:00:00Z"),
      timeEnd: moment("2031-07-20T12:00:00Z"),
    },
  },
};

export const PastEvent: Story = {
  args: {
    event: {
      ...base,
      id: 102,
      title: "Winter Championship 2019",
      description:
        "Double-elimination Dota 2 bracket. Results are in the hall of fame.",
      timeBegin: moment("2019-12-06T17:00:00Z"),
      timeEnd: moment("2019-12-08T10:00:00Z"),
    },
  },
};

export const LongTextMultiline: Story = {
  args: {
    event: {
      ...base,
      id: 103,
      title:
        "The Extremely Long Named Annual Mid-Autumn Retro Multiplayer Marathon and Charity Fundraiser",
      description:
        "Schedule:\nFriday 18:00 - Doors open, seat allocation\nFriday 20:00 - Warm-up rounds of Quake III Arena\nSaturday 10:00 - Team tournament (Age of Empires II, 4v4)\nSaturday 21:00 - Pizza, then the Mario Kart grand prix\nSunday 11:00 - Tidy up and prize giving\n\nBring: PC, monitor, keyboard, mouse, headset, power extension and a sleeping bag if you are staying over. Parking is available at the rear of the hall.",
      timeBegin: moment("2032-10-15T18:00:00Z"),
      timeEnd: moment("2032-10-17T13:00:00Z"),
    },
  },
};
