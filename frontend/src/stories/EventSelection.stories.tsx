import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import EventSelection from "../components/EventSelection";
import { sectionGap } from "../components/hl";
import {
  mockApi,
  mockResponse,
  withUser,
  type MockRequest,
  stubImages,
} from "./mockApi";

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

// Which canned response `GET /api/events` returns (set per story).
let scenario: "normal" | "empty" | "error" | "loading" = "normal";

const rsvps: Record<string, "yes" | "maybe" | "no" | null> = {
  "101": "yes",
  "102": null,
  "103": "maybe",
  "104": "yes",
  "105": "no",
};

mockApi({
  "GET /api/events": (req: MockRequest) => {
    if (scenario === "loading") return new Promise(() => {});
    if (scenario === "error")
      return mockResponse(500, {
        error: { code: 500, reason: "Internal Server Error", description: "" },
      });
    const filter = req.query.get("filter");
    const events =
      scenario === "empty"
        ? []
        : filter === "all"
          ? [...upcoming, ...past]
          : filter === "past"
            ? past
            : upcoming;
    return {
      // The user list carries the viewer's own RSVP (`myResponse`).
      events: events.map((e) => ({
        ...e,
        myResponse: rsvps[String(e.id)] ?? null,
      })),
      total: events.length,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
  },
  "GET /api/events/:id/invitations/:email": (req: MockRequest) => ({
    eventId: Number(req.params.id),
    email: req.params.email,
    avatarUrl: null,
    handle: "Sam",
    invitedAt: "2030-01-10T09:00:00Z",
    respondedAt: null,
    response: rsvps[req.params.id] ?? null,
    attendance: null,
    lastModified: "2030-01-10T09:00:00Z",
  }),
  "GET /api/events/:id/invitations": () =>
    Array.from({ length: 10 }, (_, i) => ({
      eventId: 101,
      avatarUrl: null,
      handle: `Player${i + 1}`,
      response: i < 7 ? "yes" : i < 9 ? "maybe" : null,
      attendance: null,
      seatId: i < 6 ? i + 1 : null,
      lastModified: "2030-01-10T09:00:00Z",
    })),
  "GET /api/events/:id/seats": () =>
    Array.from({ length: 10 }, (_, i) => ({ id: i + 1, label: `A${i + 1}` })),
});

stubImages();

const meta = {
  title: "Components/EventSelection",
  component: EventSelection,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    withUser({ token: "storybook-token" }),
    // The shell's <main> lays pages out as a column with the section gap.
    (Story) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: sectionGap,
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    scenario = "normal";
  },
} satisfies Meta<typeof EventSelection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Featured next event (RSVP'd yes, 7 going, 4 seats left) plus the grid. */
export const UpcomingEvents: Story = {};

export const AllEvents: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Winter Championship 2031");
    await userEvent.click(canvas.getByRole("tab", { name: "All" }));
    await expect(await canvas.findByText("Autumn Frag Fest 2019")).toBeTruthy();
  },
};

export const PastEvents: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Winter Championship 2031");
    await userEvent.click(canvas.getByRole("tab", { name: "Past" }));
    await expect(await canvas.findByText("Spring Skirmish 2020")).toBeTruthy();
  },
};

export const Loading: Story = {
  beforeEach: () => {
    scenario = "loading";
  },
};

export const Empty: Story = {
  beforeEach: () => {
    scenario = "empty";
  },
};

export const LoadError: Story = {
  beforeEach: () => {
    scenario = "error";
  },
};
