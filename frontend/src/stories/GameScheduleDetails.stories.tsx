import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import GameScheduleDetails, {
  TimingControls,
} from "../components/GameScheduleDetails";
import { colors, hairline } from "../components/hl";
import { stubImages } from "./mockApi";

stubImages();
import { GameScheduleEntry } from "../types/game_schedule";
import { GameSuggestion, GameVote } from "../types/game_suggestions";
import { InvitationLiteData, RSVP } from "../types/invitations";

// Fixed weekend: Friday 13 Nov 2026 18:00 to Sunday 15 Nov 2026 12:00.
const EVENT_START = "2026-11-13T18:00:00";
const EVENT_END = "2026-11-15T12:00:00";
const STAMP = moment("2026-10-10T10:00:00");

const gamer = (handle: string) => ({ handle, avatarUrl: null });
const nightOwl = gamer("NightOwl");
const fragQueen = gamer("FragQueen");
const bigMike = gamer("BigMike_NI");
const pixelPete = gamer("PixelPete");
const lagLord = gamer("LagLord");
const tankJoe = gamer("TankJoe");

const scheduleEntry = (
  overrides: Partial<GameScheduleEntry>,
): GameScheduleEntry => ({
  id: 1,
  eventId: 1,
  gameId: 550,
  gameName: "Left 4 Dead 2",
  startTime: moment("2026-11-13T19:00:00"),
  durationMinutes: 120,
  isPinned: true,
  isSuggested: false,
  createdAt: STAMP,
  lastModified: STAMP,
  ...overrides,
});

const suggestion = (overrides: Partial<GameSuggestion>): GameSuggestion => ({
  appid: 550,
  name: "Left 4 Dead 2",
  userEmail: "nightowl@example.com",
  comment: null,
  lastModified: STAMP,
  requestedAt: STAMP,
  suggestionLastModified: STAMP,
  selfVote: GameVote.noVote,
  votes: 0,
  voters: [],
  suggester: null,
  gamerOwned: [],
  gamerUnowned: [],
  gamerUnknown: [],
  ...overrides,
});

// Attendance buckets: Fri eve, Sat night/morning/afternoon/eve, Sun night/morning/afternoon.
const invite = (
  handle: string,
  response: RSVP,
  attendance: number[] | null,
): InvitationLiteData => ({
  eventId: 1,
  avatarUrl: null,
  handle,
  response,
  attendance,
  seatId: null,
  lastModified: STAMP,
});

const invitations: InvitationLiteData[] = [
  invite("NightOwl", RSVP.yes, [1, 1, 1, 1, 1, 1, 1, 0]),
  invite("FragQueen", RSVP.yes, [1, 0, 1, 1, 1, 0, 1, 0]),
  invite("BigMike_NI", RSVP.yes, [1, 1, 1, 1, 1, 1, 0, 0]),
  invite("PixelPete", RSVP.yes, [0, 0, 1, 1, 1, 0, 0, 0]),
  invite("LagLord", RSVP.maybe, [0, 0, 0, 1, 1, 0, 0, 0]),
  invite("TankJoe", RSVP.yes, [1, 0, 0, 1, 1, 1, 1, 0]),
];

const counterStrike = suggestion({
  appid: 730,
  name: "Counter-Strike 2",
  userEmail: "bigmike@example.com",
  comment: "Ranked-style 5v5, losers buy the pizza.",
  votes: 3,
  voters: [bigMike, lagLord, tankJoe],
  suggester: bigMike,
  gamerOwned: [bigMike, lagLord, tankJoe],
});

const ageOfEmpires = suggestion({
  appid: 813780,
  name: "Age of Empires II: Definitive Edition",
  comment: "Team games, 2v2v2.",
  votes: 2,
  voters: [pixelPete, nightOwl],
  suggester: pixelPete,
  gamerOwned: [pixelPete],
  gamerUnowned: [nightOwl],
});

const commonProps = {
  invitations,
  eventStart: EVENT_START,
  eventEnd: EVENT_END,
};

const timing = (day: number, start: string, end: string): TimingControls => ({
  days: ["FRI", "SAT", "SUN"].map((label, i) => ({
    label,
    active: i === day,
    onPick: fn(),
  })),
  start,
  end,
  onStartEarlier: fn(),
  onStartLater: fn(),
  onEndEarlier: fn(),
  onEndLater: fn(),
});

const meta = {
  title: "Components/GameScheduleDetails",
  component: GameScheduleDetails,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  // Shown as it sits in the schedule's 460px drawer.
  decorators: [
    (Story) => (
      <div
        style={{
          width: "min(460px, 100%)",
          height: 820,
          display: "flex",
          flexDirection: "column",
          background: colors.surfaceSolid,
          borderLeft: `1px solid ${hairline.strong}`,
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    scheduleEntry: scheduleEntry({}),
    onClose: fn(),
    onPin: fn(),
    onUnpin: fn(),
    onRemove: fn(),
  },
} satisfies Meta<typeof GameScheduleDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Top-voted, pinned game as seen by an admin: trophy, full player status. */
export const PinnedTopRankedAdmin: Story = {
  args: {
    ...commonProps,
    scheduleEntry: scheduleEntry({
      id: 4,
      gameId: 730,
      gameName: "Counter-Strike 2",
      startTime: moment("2026-11-14T14:00:00"),
      durationMinutes: 180,
      isPinned: true,
    }),
    suggestion: counterStrike,
    rank: 1,
    isAdmin: true,
    whenLabel: "SAT 14 NOV · 14:00 → 17:00",
    timing: timing(1, "14:00", "17:00"),
  },
};

/** Auto-scheduled suggestion: admins get a "Pin to Schedule" button. */
export const SuggestedAdmin: Story = {
  args: {
    ...commonProps,
    scheduleEntry: scheduleEntry({
      id: 3,
      gameId: 813780,
      gameName: "Age of Empires II: Definitive Edition",
      startTime: moment("2026-11-14T10:00:00"),
      durationMinutes: 180,
      isPinned: false,
      isSuggested: true,
    }),
    suggestion: ageOfEmpires,
    rank: 2,
    isAdmin: true,
    whenLabel: "SAT 14 NOV · 10:00 → 13:00",
    timing: timing(1, "10:00", "13:00"),
  },
};

/** Same pinned game for a regular member: no pin/unpin controls. */
export const MemberView: Story = {
  args: {
    ...commonProps,
    scheduleEntry: scheduleEntry({}),
    suggestion: suggestion({
      appid: 550,
      name: "Left 4 Dead 2",
      comment: "Friday night tradition. Bring snacks.",
      votes: 5,
      voters: [nightOwl, fragQueen, bigMike, pixelPete, lagLord],
      suggester: nightOwl,
      gamerOwned: [nightOwl, fragQueen, bigMike, pixelPete],
      gamerUnowned: [lagLord],
    }),
    rank: 3,
    isAdmin: false,
  },
};

/** Pinned by the host at 03:00: outside the auto-schedule window. */
export const OffWindowAdmin: Story = {
  args: {
    ...commonProps,
    scheduleEntry: scheduleEntry({
      id: 5,
      startTime: moment("2026-11-14T03:00:00"),
      durationMinutes: 120,
    }),
    suggestion: suggestion({
      appid: 550,
      name: "Left 4 Dead 2",
      votes: 1,
      voters: [nightOwl],
      suggester: nightOwl,
      gamerOwned: [nightOwl, bigMike],
      gamerUnknown: [fragQueen],
    }),
    rank: 4,
    isAdmin: true,
    outsideWindow: true,
    whenLabel: "FRI 13 NOV · 03:00 → 05:00",
    timing: timing(0, "03:00", "05:00"),
  },
};

/** A scheduled game with no matching suggestion or attendance data. */
export const NoSuggestionDetails: Story = {
  args: {
    scheduleEntry: scheduleEntry({
      id: 7,
      gameId: 976730,
      gameName: "Halo: The Master Chief Collection",
      startTime: moment("2026-11-15T10:00:00"),
      durationMinutes: 90,
      isPinned: false,
      isSuggested: true,
    }),
    isAdmin: false,
  },
};

/** Long game title and a long suggester comment stress the layout. */
export const LongNamesAndComment: Story = {
  args: {
    ...commonProps,
    scheduleEntry: scheduleEntry({
      id: 9,
      gameId: 2183900,
      gameName:
        "Warhammer 40,000: Space Marine 2 - Ultimate Edition (Operations and Eternal War)",
      startTime: moment("2026-11-14T18:30:00"),
      durationMinutes: 240,
      isPinned: true,
    }),
    suggestion: suggestion({
      appid: 2183900,
      name: "Warhammer 40,000: Space Marine 2",
      comment:
        "Six of us can squad up for Operations, then split into Eternal War for the rest of the evening. Please install the 60GB patch before Friday so we don't lose the first hour waiting on downloads.",
      votes: 3,
      voters: [nightOwl, fragQueen, tankJoe],
      suggester: gamer("Sir_Reginald_Fragsworth_III"),
      gamerOwned: [nightOwl, fragQueen],
      gamerUnowned: [tankJoe],
    }),
    rank: null,
    isAdmin: true,
  },
};
