import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import moment from "moment";
import { Route, Routes } from "react-router-dom";
import EventGameSchedule from "../components/EventGameSchedule";
import Dashboard from "../components/Dashboard";
import { sectionGap } from "../components/hl";
import {
  mockApi,
  mockResponse,
  stubImages,
  withRoute,
  withUser,
  type MockRequest,
} from "./mockApi";
import { SHELL_EVENT_ID, atPath, mockShellApi, shellEvent } from "./shellMocks";

stubImages();

// Fixed weekend: Friday 13 Nov 2026 18:00 to Sunday 15 Nov 2026 16:00.
// Timestamps carry no timezone so they render identically everywhere.
const BEGIN = "2026-11-13T18:00:00";
const END = "2026-11-15T16:00:00";

const event = (id: number, title: string, begin = BEGIN, end = END) => ({
  id,
  title,
  description: "Three days of co-op, RTS and late-night shooters.",
  image: null,
  timeBegin: begin,
  timeEnd: end,
  createdAt: "2026-09-01T10:00:00",
  lastModified: "2026-10-20T09:30:00",
});

const gamer = (handle: string) => ({ handle, avatarUrl: null });
const nightOwl = gamer("NightOwl");
const fragQueen = gamer("FragQueen");
const bigMike = gamer("BigMike_NI");
const pixelPete = gamer("PixelPete");
const lagLord = gamer("LagLord");
const tankJoe = gamer("TankJoe");
const squad = [nightOwl, fragQueen, bigMike, pixelPete, lagLord, tankJoe];

type Gamer = ReturnType<typeof gamer>;

const suggestion = (
  appid: number,
  name: string,
  requestedAt: string,
  suggester: Gamer,
  voters: Gamer[],
  owned: Gamer[],
  comment: string | null,
) => ({
  appid,
  name,
  userEmail: "",
  comment,
  lastModified: "2026-10-18T12:00:00",
  requestedAt,
  suggestionLastModified: "2026-10-18T12:00:00",
  selfVote: "noVote",
  votes: voters.length,
  voters,
  suggester,
  gamerOwned: owned,
  gamerUnowned: voters.filter((v) => !owned.includes(v)),
  gamerUnknown: squad.filter((g) => !owned.includes(g) && !voters.includes(g)),
});

const baseSuggestions = () => [
  suggestion(
    730,
    "Counter-Strike 2",
    "2026-10-01T09:00:00",
    nightOwl,
    [nightOwl, fragQueen, bigMike, pixelPete, tankJoe],
    [nightOwl, fragQueen, bigMike, tankJoe],
    "5v5 with subs rotating in.",
  ),
  suggestion(
    548430,
    "Deep Rock Galactic",
    "2026-10-02T09:00:00",
    fragQueen,
    [fragQueen, bigMike, nightOwl],
    [fragQueen, bigMike],
    "Rock and Stone! Two squads of three.",
  ),
  suggestion(
    427520,
    "Factorio",
    "2026-10-03T09:00:00",
    pixelPete,
    [pixelPete, bigMike],
    [pixelPete, bigMike, tankJoe],
    null,
  ),
  suggestion(
    813780,
    "Age of Empires II: Definitive Edition",
    "2026-10-04T09:00:00",
    pixelPete,
    [pixelPete],
    [pixelPete],
    "Classic 3v3 on Arabia.",
  ),
  suggestion(
    252950,
    "Rocket League",
    "2026-10-05T09:00:00",
    lagLord,
    [lagLord],
    [lagLord, fragQueen],
    null,
  ),
];

let nextId = 100;
const entry = (
  eventId: number,
  gameId: number,
  gameName: string,
  startTime: string,
  durationMinutes: number,
  isPinned: boolean,
) => ({
  id: isPinned ? nextId++ : 0,
  eventId,
  gameId,
  gameName,
  startTime,
  durationMinutes,
  isPinned,
  isSuggested: !isPinned,
  createdAt: "2026-10-10T10:00:00",
  lastModified: "2026-10-10T10:00:00",
});

/** Sessions relative to the local midnight of the event's first day. */
const scheduleFor = (eventId: number, firstDay = "2026-11-13") => {
  const at = (dayOffset: number, h: number) =>
    moment(firstDay)
      .add(dayOffset, "days")
      .add(h * 60, "minutes")
      .format("YYYY-MM-DDTHH:mm:ss");
  return [
    entry(eventId, 730, "Counter-Strike 2", at(0, 18.5), 120, true),
    entry(eventId, 548430, "Deep Rock Galactic", at(0, 21), 150, true),
    entry(eventId, 427520, "Factorio", at(1, 10), 180, false),
    entry(
      eventId,
      813780,
      "Age of Empires II: Definitive Edition",
      at(1, 14),
      180,
      true,
    ),
    entry(eventId, 730, "Counter-Strike 2", at(1, 19), 180, false),
    entry(eventId, 252950, "Rocket League", at(2, 11), 90, false),
  ];
};

// Attendance buckets (UTC grid): Fri eve, Sat night/morning/afternoon/eve,
// Sun night/morning/afternoon.
const invite = (
  eventId: number,
  handle: string,
  response: string,
  attendance: number[] | null,
) => ({
  eventId,
  avatarUrl: null,
  handle,
  response,
  attendance,
  seatId: null,
  lastModified: "2026-10-15T18:00:00",
});

const invitationsFor = (eventId: number) => [
  invite(eventId, "NightOwl", "yes", [1, 1, 1, 1, 1, 1, 1, 1]),
  invite(eventId, "FragQueen", "yes", [1, 0, 1, 1, 1, 0, 1, 0]),
  invite(eventId, "BigMike_NI", "yes", [1, 1, 1, 1, 1, 1, 0, 0]),
  invite(eventId, "PixelPete", "yes", [0, 0, 1, 1, 1, 0, 0, 0]),
  invite(eventId, "LagLord", "maybe", [0, 0, 0, 1, 1, 0, 1, 1]),
  invite(eventId, "TankJoe", "yes", [1, 0, 0, 1, 1, 1, 1, 0]),
];

const steamCatalog = [
  [892970, "Valheim"],
  [105600, "Terraria"],
  [550, "Left 4 Dead 2"],
  [570, "Dota 2"],
  [440, "Team Fortress 2"],
  [620, "Portal 2"],
  [1086940, "Baldur's Gate 3"],
  [413150, "Stardew Valley"],
  [294100, "RimWorld"],
  [322330, "Don't Starve Together"],
  [553850, "HELLDIVERS 2"],
  [1966720, "Lethal Company"],
  [632360, "Risk of Rain 2"],
].map(([appid, name]) => ({
  appid,
  name,
  last_modified: "2026-09-01T00:00:00",
  rank: null,
}));

mockApi({
  "GET /api/steam-game": ({ query }: MockRequest) => {
    const q = (query.get("query") ?? "").toLowerCase();
    return steamCatalog.filter((g) => String(g.name).toLowerCase().includes(q));
  },
  "GET /api/steam-game-update-v2/stats": {
    gamesCached: 48297,
    lastRefreshed: "2026-09-27T10:00:00",
  },
});

/**
 * Register a stateful fake schedule API for one event id: moves, pins,
 * removals, adds and suggestions all persist while the story is open.
 */
function mockScheduleApi(
  id: number,
  options: {
    event?: ReturnType<typeof event>;
    schedule?: ReturnType<typeof entry>[];
    suggestions?: ReturnType<typeof suggestion>[];
    invitations?: ReturnType<typeof invite>[];
    scheduleError?: boolean;
  } = {},
) {
  let schedule = options.schedule ?? scheduleFor(id);
  let suggestions = options.suggestions ?? baseSuggestions();
  const invitations = options.invitations ?? invitationsFor(id);
  const base = `/api/events/${id}`;
  const nameOf = (gameId: number) =>
    suggestions.find((g) => g.appid === gameId)?.name ??
    String(steamCatalog.find((g) => g.appid === gameId)?.name ?? "Game");
  type Body = { gameId: number; startTime: string; durationMinutes: number };
  const create = (b: Body) => {
    const e = {
      ...entry(
        id,
        b.gameId,
        nameOf(b.gameId),
        b.startTime,
        b.durationMinutes,
        true,
      ),
    };
    // Pinning a game drops its auto-planned slots (as the scheduler does).
    schedule = [
      ...schedule.filter((s) => s.isPinned || s.gameId !== b.gameId),
      e,
    ];
    return e;
  };
  mockApi({
    [`GET ${base}`]: options.event ?? event(id, "Autumn LAN 2026"),
    [`GET ${base}/game_schedule`]: () =>
      options.scheduleError
        ? mockResponse(500, { error: { description: "boom" } })
        : schedule,
    [`POST ${base}/game_schedule`]: ({ body }: MockRequest) =>
      create(body as Body),
    [`POST ${base}/game_schedule/pin`]: ({ body }: MockRequest) =>
      create(body as Body),
    [`POST ${base}/game_schedule/recalculate`]: () =>
      schedule.filter((s) => !s.isPinned),
    [`PATCH ${base}/game_schedule/:sid`]: ({ params, body }: MockRequest) => {
      const b = body as Body;
      schedule = schedule.map((s) =>
        s.id === Number(params.sid)
          ? { ...s, startTime: b.startTime, durationMinutes: b.durationMinutes }
          : s,
      );
      return schedule.find((s) => s.id === Number(params.sid));
    },
    [`DELETE ${base}/game_schedule/:sid`]: ({ params }: MockRequest) => {
      schedule = schedule.filter((s) => s.id !== Number(params.sid));
      return null;
    },
    [`GET ${base}/suggested_games`]: () => suggestions,
    [`POST ${base}/suggested_games`]: ({ body }: MockRequest) => {
      const { appid } = body as { appid: number };
      const s = suggestion(
        appid,
        nameOf(appid),
        "2026-10-20T09:00:00",
        nightOwl,
        [nightOwl],
        [],
        null,
      );
      suggestions = [...suggestions, s];
      return s;
    },
    [`GET ${base}/invitations`]: invitations,
  });
}

// Each story owns an event id so the page-global fetch mocks never clash.
mockScheduleApi(301); // populated, member
mockScheduleApi(302); // populated, admin
mockScheduleApi(303, { schedule: [] }); // empty, admin
mockScheduleApi(304, { schedule: [], suggestions: [], invitations: [] }); // empty, member
mockScheduleApi(305, { scheduleError: true }); // schedule fails to load
mockScheduleApi(306); // details open
mockScheduleApi(307); // add dialog
mockScheduleApi(308); // add dialog, catalogue search
mockApi({ "GET /api/events/309": mockResponse(500, null) }); // event error

const meta = {
  title: "Components/EventGameSchedule",
  component: EventGameSchedule,
  parameters: {
    layout: "padded",
  },
  decorators: [
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
  tags: ["autodocs"],
} satisfies Meta<typeof EventGameSchedule>;

export default meta;
type Story = StoryObj<typeof meta>;

const route = (id: number) =>
  withRoute("/events/:id/schedule", `/events/${id}/schedule`);

/** Member view: read-only timeline, day cards, details on tap. */
export const PopulatedMember: Story = {
  decorators: [route(301), withUser({ isAdmin: false })],
};

/**
 * Admin view: drag blocks (also across days), resize from the edges, arrow
 * keys to nudge; Recalculate and Add to schedule in the header.
 */
export const PopulatedAdmin: Story = {
  decorators: [route(302), withUser({ isAdmin: true })],
};

/** Admin with nothing scheduled yet. */
export const EmptyAdmin: Story = {
  decorators: [route(303), withUser({ isAdmin: true })],
};

/** Member view before any games have been scheduled. */
export const EmptyMember: Story = {
  decorators: [route(304), withUser({ isAdmin: false })],
};

/** The schedule request fails: the timeline offers a retry. */
export const ScheduleLoadError: Story = {
  decorators: [route(305), withUser({ isAdmin: true })],
};

/** The event itself fails to load. */
export const EventLoadError: Story = {
  decorators: [route(309), withUser({ isAdmin: false })],
};

/** Session details drawer (admin): timing controls, squad, owners, voters. */
export const SessionDetails: Story = {
  decorators: [route(306), withUser({ isAdmin: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The timeline block (the day card has the same name).
    const [block] = await canvas.findAllByRole("button", {
      name: /^Counter-Strike 2, Friday 18:30/,
    });
    await userEvent.click(block);
  },
};

/** Add to schedule: pick a game (suggested first, then the Steam cache). */
export const AddToSchedule: Story = {
  decorators: [route(307), withUser({ isAdmin: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Add to schedule/ }),
    );
  },
};

/** Add to schedule, second step for a game nobody has suggested yet. */
export const AddUnsuggestedGame: Story = {
  decorators: [route(308), withUser({ isAdmin: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Add to schedule/ }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await body.findByRole("searchbox", { name: "Search games" }),
      "val",
    );
    await userEvent.click(
      await body.findByRole("button", { name: /Valheim/ }, { timeout: 3000 }),
    );
  },
};

/** The page inside the app shell (sidebar, breadcrumb, ticker). */
export const InShell: Story = {
  parameters: { layout: "fullscreen", router: false },
  render: () => (
    <Dashboard>
      <Routes>
        <Route path="/events/:id/schedule" element={<EventGameSchedule />} />
      </Routes>
    </Dashboard>
  ),
  decorators: [
    (Story) => {
      mockShellApi("yes");
      const firstDay = moment(shellEvent.timeBegin).format("YYYY-MM-DD");
      mockScheduleApi(SHELL_EVENT_ID, {
        event: {
          ...event(SHELL_EVENT_ID, shellEvent.title),
          timeBegin: shellEvent.timeBegin,
          timeEnd: shellEvent.timeEnd,
        },
        schedule: scheduleFor(SHELL_EVENT_ID, firstDay).map((s, i) =>
          i === 0
            ? {
                ...s,
                startTime: moment(firstDay)
                  .add(19, "h")
                  .format("YYYY-MM-DDTHH:mm:ss"),
              }
            : s,
        ),
      });
      return <Story />;
    },
    withUser({ isAdmin: true }),
    atPath(`/events/${SHELL_EVENT_ID}/schedule`),
  ],
};
