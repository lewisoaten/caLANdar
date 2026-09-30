import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import moment from "moment";
import GamesList from "../components/GamesList";
import { EventGame, Gamer } from "../types/game_suggestions";
import { stubImages } from "./mockApi";

const gamers: Gamer[] = [
  { handle: "NightOwl", avatarUrl: null },
  { handle: "PixelPirate", avatarUrl: null },
  { handle: "Rowan_the_Rogue", avatarUrl: null },
  { handle: "FragQueen", avatarUrl: null },
  { handle: "LagLord", avatarUrl: null },
  { handle: "CritHappens", avatarUrl: null },
  { handle: "SneakyBiscuit", avatarUrl: null },
  { handle: "ToastedRouter", avatarUrl: null },
];

const modified = moment("2024-06-01T12:00:00Z");

const game = (
  appid: number,
  name: string,
  playtimeForever: number,
  owners: number,
): EventGame => ({
  appid,
  name,
  playtimeForever,
  gamerOwned: gamers.slice(0, owners),
  lastModified: modified,
});

const games = new Map<number, EventGame[]>([
  [8, [game(730, "Counter-Strike 2", 98430, 8), game(570, "Dota 2", 41250, 8)]],
  [
    5,
    [
      game(1172470, "Apex Legends", 12600, 5),
      game(440, "Team Fortress 2", 3400, 6),
      game(
        1091500,
        "Cyberpunk 2077: Phantom Liberty Ultimate Edition Deluxe Bundle",
        0,
        5,
      ),
    ],
  ],
  [
    3,
    [
      game(105600, "Terraria", 745, 3),
      game(252490, "Rust", 90, 3),
      game(892970, "Valheim", 26, 4),
    ],
  ],
]);

stubImages();

const meta = {
  title: "Components/GamesList",
  component: GamesList,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    loadNewPage: fn(),
    games,
    gamesCount: 4,
    loading: false,
    showOwnership: true,
  },
} satisfies Meta<typeof GamesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedByOwnership: Story = {};

export const WithoutOwnershipHeadings: Story = {
  args: {
    showOwnership: false,
    games: new Map([[1, [...games.get(8)!, ...games.get(3)!]]]),
    gamesCount: 2,
  },
};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: { games: new Map(), gamesCount: 1 },
};
