import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import GamersAdmin from "../components/GamersAdmin";
import { mockApi, withUser, type MockRequest } from "./mockApi";

const meta = {
  title: "Components/GamersAdmin",
  component: GamersAdmin,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withUser({ isAdmin: true })],
  tags: ["autodocs"],
} satisfies Meta<typeof GamersAdmin>;

export default meta;
type Story = StoryObj<typeof meta>;

// The API returns ISO strings; the component parses them into moments.
interface MockGamer {
  email: string;
  avatarUrl: string | null;
  handles: string[];
  steamId: string | null;
  eventsInvitedCount: number;
  eventsAcceptedCount: number;
  eventsTentativeCount: number;
  eventsDeclinedCount: number;
  eventsLastResponse: string | null;
  gamesOwnedCount: number;
  gamesOwnedLastModified: string | null;
}

const gamers: MockGamer[] = [
  {
    email: "alex.harding@example.com",
    avatarUrl: null,
    handles: ["FragMaster", "AlexH"],
    steamId: "76561198012345601",
    eventsInvitedCount: 8,
    eventsAcceptedCount: 7,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-20T19:42:00Z",
    gamesOwnedCount: 412,
    gamesOwnedLastModified: "2026-02-21T08:15:00Z",
  },
  {
    email: "bex.okafor@example.com",
    avatarUrl: null,
    handles: ["PixelPirate"],
    steamId: "76561198012345602",
    eventsInvitedCount: 6,
    eventsAcceptedCount: 5,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-18T11:05:00Z",
    gamesOwnedCount: 187,
    gamesOwnedLastModified: "2026-02-19T20:30:00Z",
  },
  {
    email: "callum.reid@example.com",
    avatarUrl: null,
    handles: ["NightOwl", "CallumR", "OwlOnTheLAN", "sleep_is_for_the_weak"],
    steamId: "76561198012345603",
    eventsInvitedCount: 9,
    eventsAcceptedCount: 9,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-22T22:10:00Z",
    gamesOwnedCount: 963,
    gamesOwnedLastModified: "2026-02-22T22:45:00Z",
  },
  {
    email: "dani.moreno@example.com",
    avatarUrl: null,
    handles: ["CasualDani"],
    steamId: null,
    eventsInvitedCount: 3,
    eventsAcceptedCount: 1,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-01-30T09:00:00Z",
    gamesOwnedCount: 0,
    gamesOwnedLastModified: null,
  },
  {
    email: "eilidh.macleod@example.com",
    avatarUrl: null,
    handles: ["HeadshotHaggis"],
    steamId: "76561198012345605",
    eventsInvitedCount: 5,
    eventsAcceptedCount: 4,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-10T17:25:00Z",
    gamesOwnedCount: 254,
    gamesOwnedLastModified: "2026-02-11T12:00:00Z",
  },
  {
    email: "finn.oconnell@example.com",
    avatarUrl: null,
    handles: ["LagSwitchLarry"],
    steamId: "76561198012345606",
    eventsInvitedCount: 4,
    eventsAcceptedCount: 2,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 2,
    eventsLastResponse: "2025-11-14T18:00:00Z",
    gamesOwnedCount: 76,
    gamesOwnedLastModified: "2025-11-15T10:10:00Z",
  },
  {
    email: "grace.liu@example.com",
    avatarUrl: null,
    handles: ["SupportMain"],
    steamId: "76561198012345607",
    eventsInvitedCount: 7,
    eventsAcceptedCount: 6,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-19T14:50:00Z",
    gamesOwnedCount: 331,
    gamesOwnedLastModified: "2026-02-20T09:20:00Z",
  },
  {
    email: "hamza.qureshi@example.com",
    avatarUrl: null,
    handles: ["RushB_NoStop"],
    steamId: "76561198012345608",
    eventsInvitedCount: 6,
    eventsAcceptedCount: 3,
    eventsTentativeCount: 2,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-01-12T20:15:00Z",
    gamesOwnedCount: 148,
    gamesOwnedLastModified: "2026-01-13T07:45:00Z",
  },
  {
    email: "isla.brennan@example.com",
    avatarUrl: null,
    handles: ["CritHitCharlie", "IslaB"],
    steamId: "76561198012345609",
    eventsInvitedCount: 5,
    eventsAcceptedCount: 5,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-21T10:30:00Z",
    gamesOwnedCount: 520,
    gamesOwnedLastModified: "2026-02-21T18:00:00Z",
  },
  {
    email: "jamie.whitfield@example.com",
    avatarUrl: null,
    handles: ["NoScopeNinja"],
    steamId: null,
    eventsInvitedCount: 2,
    eventsAcceptedCount: 0,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 2,
    eventsLastResponse: "2025-10-02T12:00:00Z",
    gamesOwnedCount: 0,
    gamesOwnedLastModified: null,
  },
  {
    email: "kiran.patel@example.com",
    avatarUrl: null,
    handles: ["TankTopKiran"],
    steamId: "76561198012345611",
    eventsInvitedCount: 8,
    eventsAcceptedCount: 6,
    eventsTentativeCount: 2,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-17T16:40:00Z",
    gamesOwnedCount: 289,
    gamesOwnedLastModified: "2026-02-18T13:35:00Z",
  },
  {
    email: "lena.fischer@example.com",
    avatarUrl: null,
    handles: ["SpeedrunLena"],
    steamId: "76561198012345612",
    eventsInvitedCount: 6,
    eventsAcceptedCount: 4,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-05T08:55:00Z",
    gamesOwnedCount: 205,
    gamesOwnedLastModified: "2026-02-06T21:05:00Z",
  },
  {
    email: "marcus.bell@example.com",
    avatarUrl: null,
    handles: ["BigBellBoom"],
    steamId: "76561198012345613",
    eventsInvitedCount: 9,
    eventsAcceptedCount: 8,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-22T09:15:00Z",
    gamesOwnedCount: 640,
    gamesOwnedLastModified: "2026-02-22T09:30:00Z",
  },
  {
    email: "nia.abara@example.com",
    avatarUrl: null,
    handles: ["MedicNia"],
    steamId: "76561198012345614",
    eventsInvitedCount: 4,
    eventsAcceptedCount: 3,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-01T19:00:00Z",
    gamesOwnedCount: 98,
    gamesOwnedLastModified: "2026-02-02T11:11:00Z",
  },
  {
    email: "owen.tanaka@example.com",
    avatarUrl: null,
    handles: ["OwenTheTerrible"],
    steamId: "76561198012345615",
    eventsInvitedCount: 5,
    eventsAcceptedCount: 2,
    eventsTentativeCount: 2,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-01-25T15:20:00Z",
    gamesOwnedCount: 172,
    gamesOwnedLastModified: "2026-01-26T09:00:00Z",
  },
  {
    email: "priya.nair@example.com",
    avatarUrl: null,
    handles: ["PriyaPlaysFair"],
    steamId: null,
    eventsInvitedCount: 1,
    eventsAcceptedCount: 0,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-15T13:00:00Z",
    gamesOwnedCount: 0,
    gamesOwnedLastModified: null,
  },
  {
    email: "quinn.davies@example.com",
    avatarUrl: null,
    handles: ["QuinnQuake"],
    steamId: "76561198012345617",
    eventsInvitedCount: 7,
    eventsAcceptedCount: 7,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-20T21:00:00Z",
    gamesOwnedCount: 377,
    gamesOwnedLastModified: "2026-02-20T21:20:00Z",
  },
  {
    email: "ruairi.byrne@example.com",
    avatarUrl: null,
    handles: ["RuairiRespawn", "R_Byrne"],
    steamId: "76561198012345618",
    eventsInvitedCount: 6,
    eventsAcceptedCount: 5,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-12T18:45:00Z",
    gamesOwnedCount: 301,
    gamesOwnedLastModified: "2026-02-13T10:00:00Z",
  },
  {
    email: "sofia.rossi@example.com",
    avatarUrl: null,
    handles: ["SniperSofia"],
    steamId: "76561198012345619",
    eventsInvitedCount: 5,
    eventsAcceptedCount: 4,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-08T12:30:00Z",
    gamesOwnedCount: 134,
    gamesOwnedLastModified: "2026-02-09T16:00:00Z",
  },
  {
    email: "tom.gallagher@example.com",
    avatarUrl: null,
    handles: ["TiltedTom"],
    steamId: "76561198012345620",
    eventsInvitedCount: 8,
    eventsAcceptedCount: 5,
    eventsTentativeCount: 2,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-16T20:05:00Z",
    gamesOwnedCount: 458,
    gamesOwnedLastModified: "2026-02-17T08:00:00Z",
  },
  {
    email: "uma.sharma@example.com",
    avatarUrl: null,
    handles: ["UltimateUma"],
    steamId: "76561198012345621",
    eventsInvitedCount: 3,
    eventsAcceptedCount: 3,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-14T09:40:00Z",
    gamesOwnedCount: 64,
    gamesOwnedLastModified: "2026-02-14T09:55:00Z",
  },
  {
    email: "victor.lindqvist@example.com",
    avatarUrl: null,
    handles: ["ViktorTheViking"],
    steamId: "76561198012345622",
    eventsInvitedCount: 6,
    eventsAcceptedCount: 3,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 2,
    eventsLastResponse: "2026-01-19T17:10:00Z",
    gamesOwnedCount: 219,
    gamesOwnedLastModified: "2026-01-20T12:25:00Z",
  },
  {
    email: "wren.callahan@example.com",
    avatarUrl: null,
    handles: ["WrenWallhack"],
    steamId: null,
    eventsInvitedCount: 2,
    eventsAcceptedCount: 1,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-03T14:15:00Z",
    gamesOwnedCount: 41,
    gamesOwnedLastModified: "2026-02-04T09:09:00Z",
  },
  {
    email: "xander.hughes@example.com",
    avatarUrl: null,
    handles: ["XanderXP"],
    steamId: "76561198012345624",
    eventsInvitedCount: 4,
    eventsAcceptedCount: 4,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 0,
    eventsLastResponse: "2026-02-13T19:30:00Z",
    gamesOwnedCount: 356,
    gamesOwnedLastModified: "2026-02-14T07:30:00Z",
  },
  {
    email: "yasmin.elhadi@example.com",
    avatarUrl: null,
    handles: ["YasminYolo"],
    steamId: "76561198012345625",
    eventsInvitedCount: 5,
    eventsAcceptedCount: 3,
    eventsTentativeCount: 1,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-09T11:00:00Z",
    gamesOwnedCount: 117,
    gamesOwnedLastModified: "2026-02-10T15:45:00Z",
  },
  {
    email: "zoe.kowalski@example.com",
    avatarUrl: null,
    handles: ["ZeroCoolZoe"],
    steamId: "76561198012345626",
    eventsInvitedCount: 7,
    eventsAcceptedCount: 6,
    eventsTentativeCount: 0,
    eventsDeclinedCount: 1,
    eventsLastResponse: "2026-02-21T20:00:00Z",
    gamesOwnedCount: 498,
    gamesOwnedLastModified: "2026-02-22T06:30:00Z",
  },
];

mockApi({
  "GET /api/gamers": (req: MockRequest) => {
    const page = Number(req.query.get("page") ?? "1");
    const limit = Number(req.query.get("limit") ?? "20");
    const search = (req.query.get("search") ?? "").toLowerCase();

    const matching = search
      ? gamers.filter(
          (g) =>
            g.email.toLowerCase().includes(search) ||
            g.handles.some((h) => h.toLowerCase().includes(search)),
        )
      : gamers;

    return {
      gamers: matching.slice((page - 1) * limit, page * limit),
      total: matching.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(matching.length / limit)),
    };
  },
  "PUT /api/profile/:email": {},
});

/** Full gamer list, first page of 20 (26 gamers in total), admin view. */
export const Default: Story = {};

/** Admin searches by handle; the grid narrows to matching gamers. */
export const SearchByHandle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("Search by email or handle"),
      "night",
    );
    await waitFor(
      () => expect(canvas.queryByText("dani.moreno@example.com")).toBeNull(),
      { timeout: 3000 },
    );
  },
};

/** Search with no matches shows the empty grid overlay. */
export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("Search by email or handle"),
      "zzzz-no-such-gamer",
    );
    await waitFor(
      () => expect(canvas.queryByText("alex.harding@example.com")).toBeNull(),
      { timeout: 3000 },
    );
  },
};
