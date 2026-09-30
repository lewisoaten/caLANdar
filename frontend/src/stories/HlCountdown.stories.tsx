import type { Meta, StoryObj } from "@storybook/react-vite";
import { Countdown } from "../components/hl";

const now = Date.UTC(2026, 9, 1, 0, 0, 0);
const target = now + (15 * 86400 + 18 * 3600 + 43 * 60 + 39) * 1000;

const meta = {
  title: "HyperLAN/Countdown",
  component: Countdown,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { target, now, label: "Time until doors open" },
} satisfies Meta<typeof Countdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cells: Story = {};
export const Inline: Story = { args: { variant: "inline" } };
export const Live: Story = {
  args: { target: Date.now() + 3 * 86400000, now: undefined },
};
export const Done: Story = {
  args: { target: now - 1000, doneContent: "Doors are open" },
};
