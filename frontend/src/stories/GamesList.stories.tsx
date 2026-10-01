import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import GamesList, { type SquadGame } from "../components/GamesList";
import { Gamer } from "../types/game_suggestions";
import { stubImages } from "./mockApi";

const squad: Gamer[] = [
  "ProGamer123",
  "NoScope_Nia",
  "LagWizard",
  "CasualGamer",
  "SamTheSniper",
  "Dan_the_Man",
].map((handle) => ({ handle, avatarUrl: null }));

const modified = moment("2026-09-01T12:00:00Z");

const game = (
  appid: number,
  name: string,
  owners: number[],
  playtimeForever: number,
  vote?: { rank: number; votes: number },
): SquadGame => ({
  appid,
  name,
  playtimeForever,
  gamerOwned: owners.map((i) => squad[i]),
  lastModified: modified,
  vote: vote ?? null,
});

const squadGames: SquadGame[] = [
  game(730, "Counter-Strike 2", [0, 1, 2, 4, 5], 98430, { rank: 1, votes: 5 }),
  game(548430, "Deep Rock Galactic", [0, 1, 2, 5], 12960, {
    rank: 2,
    votes: 3,
  }),
  game(427520, "Factorio", [0, 2, 4, 5], 41250, { rank: 3, votes: 2 }),
  game(892970, "Valheim", [1, 2, 3, 4], 4300),
  game(813780, "Age of Empires II: Definitive Edition", [0, 2, 5], 2210, {
    rank: 4,
    votes: 1,
  }),
  game(105600, "Terraria", [1, 3, 4], 745),
  game(550, "Left 4 Dead 2", [0, 4], 3400),
  game(252950, "Rocket League", [1, 4], 1800, { rank: 5, votes: 1 }),
  game(1091500, "Cyberpunk 2077: Phantom Liberty Ultimate Edition", [3], 0),
];

stubImages();

const meta = {
  title: "Components/GamesList",
  component: GamesList,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    games: squadGames,
    squadSize: 6,
    loading: false,
    me: { handle: "ProGamer123", avatarUrl: null },
    lobbyHref: "/events/901",
    onSuggest: fn(),
    onRetry: fn(),
  },
} satisfies Meta<typeof GamesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedByOwnership: Story = {};

/** RSVP'd "no" or the event has ended: no suggest buttons. */
export const CannotSuggest: Story = {
  args: { onSuggest: undefined, suggestUnavailable: "Suggestions closed" },
};

export const LoadingMore: Story = {
  args: { loadingMore: true },
};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: { games: [] },
};

export const LoadError: Story = {
  args: { games: [], error: "Something went wrong. Please try again." },
};
