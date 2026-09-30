import type { Meta, StoryObj } from "@storybook/react";
import Account from "../components/Account";
import { mockApi, withUser, stubImages } from "./mockApi";

const library = [
  { appid: 730, name: "Counter-Strike 2", playtimeForever: 98430 },
  { appid: 570, name: "Dota 2", playtimeForever: 41250 },
  { appid: 1172470, name: "Apex Legends", playtimeForever: 12600 },
  { appid: 440, name: "Team Fortress 2", playtimeForever: 3400 },
  { appid: 105600, name: "Terraria", playtimeForever: 745 },
  { appid: 252490, name: "Rust", playtimeForever: 90 },
  { appid: 892970, name: "Valheim", playtimeForever: 26 },
  {
    appid: 1091500,
    name: "Cyberpunk 2077: Phantom Liberty Ultimate Edition Deluxe Bundle",
    playtimeForever: 0,
  },
  { appid: 1245620, name: "ELDEN RING", playtimeForever: 0 },
  { appid: 1086940, name: "Baldur's Gate 3", playtimeForever: 0 },
  { appid: 381210, name: "Dead by Daylight", playtimeForever: 0 },
  { appid: 550, name: "Left 4 Dead 2", playtimeForever: 2210 },
];

mockApi({
  "GET /api/profile": {
    steamId: "76561198012345678",
    games: library,
    gameCount: 4,
  },
  "PUT /api/profile": {},
  "POST /api/profile/games/update": {},
});

stubImages();

const meta = {
  title: "Components/Account",
  component: Account,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [withUser({ email: "sam.rivers@example.com" })],
} satisfies Meta<typeof Account>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSteamLibrary: Story = {};
