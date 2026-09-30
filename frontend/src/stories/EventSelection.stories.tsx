import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import EventSelection from "../components/EventSelection";
import { mockApi, withUser, type MockRequest, stubImages } from "./mockApi";

const upcoming = [
  {
    id: 101,
    title: "Summer LAN Party 2031",
    description:
      "Three days of Counter-Strike, Rocket League and questionable pizza. Bring your own rig, headset and extension lead.",
    timeBegin: "2031-07-18T18:00:00Z",
    timeEnd: "2031-07-20T12:00:00Z",
    createdAt: "2030-01-10T09:00:00Z",
    lastModified: "2030-02-01T09:00:00Z",
  },
  {
    id: 102,
    title: "Winter Championship 2031",
    description:
      "Double-elimination Dota 2 bracket with a trophy and bragging rights.",
    timeBegin: "2031-12-05T17:00:00Z",
    timeEnd: "2031-12-07T10:00:00Z",
    createdAt: "2030-03-01T09:00:00Z",
    lastModified: "2030-03-02T09:00:00Z",
  },
  {
    id: 103,
    title: "Retro Night: LAN Like It's 1999",
    description:
      "Quake III, Unreal Tournament and Age of Empires II.\nCRT monitors encouraged.",
    timeBegin: "2032-02-14T19:00:00Z",
    timeEnd: "2032-02-15T06:00:00Z",
    createdAt: "2030-04-01T09:00:00Z",
    lastModified: "2030-04-01T09:00:00Z",
  },
];

const past = [
  {
    id: 104,
    title: "Autumn Frag Fest 2019",
    description:
      "Where it all started: eight players and one very hot spare room.",
    timeBegin: "2019-10-11T18:00:00Z",
    timeEnd: "2019-10-13T12:00:00Z",
    createdAt: "2019-08-01T09:00:00Z",
    lastModified: "2019-08-01T09:00:00Z",
  },
  {
    id: 105,
    title: "Spring Skirmish 2020",
    description: "Team Fortress 2 and Valheim co-op.",
    timeBegin: "2020-03-06T18:00:00Z",
    timeEnd: "2020-03-08T12:00:00Z",
    createdAt: "2020-01-01T09:00:00Z",
    lastModified: "2020-01-01T09:00:00Z",
  },
];

mockApi({
  "GET /api/events": (req: MockRequest) => {
    const all = req.query.get("filter") === "all";
    return {
      events: all ? [...upcoming, ...past] : upcoming,
      total: all ? 5 : 3,
      page: 1,
      limit: 20,
      totalPages: all ? 3 : 1,
    };
  },
});

stubImages();

const meta = {
  title: "Components/EventSelection",
  component: EventSelection,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [withUser({ token: "storybook-token" })],
} satisfies Meta<typeof EventSelection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpcomingEvents: Story = {};

export const IncludingOldEventsAndPagination: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Summer LAN Party 2031");
    await userEvent.click(canvas.getByRole("checkbox"));
    await expect(await canvas.findByText("Autumn Frag Fest 2019")).toBeTruthy();
  },
};
