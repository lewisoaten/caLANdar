import type { Meta, StoryObj } from "@storybook/react-vite";
import GameOwners from "../components/GameOwners";
import { Gamer } from "../types/game_suggestions";

const gamers: Gamer[] = [
  { handle: "NightOwl", avatarUrl: null },
  { handle: "PixelPirate", avatarUrl: null },
  { handle: "Rowan_the_Rogue", avatarUrl: null },
  { handle: "FragQueen", avatarUrl: null },
  { handle: "LagLord", avatarUrl: null },
  { handle: "CritHappens", avatarUrl: null },
  { handle: "SneakyBiscuit", avatarUrl: null },
  { handle: "ToastedRouter", avatarUrl: null },
  { handle: "GG_Gary", avatarUrl: null },
];

const meta = {
  title: "Components/GameOwners",
  component: GameOwners,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof GameOwners>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FewOwners: Story = {
  args: { gamerOwned: gamers.slice(0, 3) },
};

export const ManyOwners: Story = {
  args: { gamerOwned: gamers },
};

export const NoOwners: Story = {
  args: { gamerOwned: [] },
};

export const NoOwnersHidden: Story = {
  args: { gamerOwned: [], hideIfEmpty: true },
};

export const OwnersUnownedAndUnknown: Story = {
  args: {
    gamerOwned: gamers.slice(0, 4),
    gamerUnowned: gamers.slice(4, 7),
    gamerUnknown: gamers.slice(7),
  },
};
