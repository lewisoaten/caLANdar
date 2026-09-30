import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { Trophy } from "../components/hl";

const meta = {
  title: "HyperLAN/Trophy",
  component: Trophy,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { rank: 1, size: 28 },
} satisfies Meta<typeof Trophy>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gold: Story = {};
export const Podium: Story = {
  render: () => (
    <Box sx={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4].map((r) => (
        <Trophy key={r} rank={r} size={32} />
      ))}
    </Box>
  ),
};
