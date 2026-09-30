import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { StatCell, StatGrid } from "../components/hl";

const meta = {
  title: "HyperLAN/StatCell",
  component: StatCell,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { value: 12, label: "Invited" },
} satisfies Meta<typeof StatCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const GamerCardRow: Story = {
  render: () => (
    <Box sx={{ maxWidth: 560 }}>
      <StatGrid>
        <StatCell value={3} label="Invited" />
        <StatCell value={2} label="In" tone="lime" />
        <StatCell value={0} label="Maybe" tone="amber" />
        <StatCell value={30} label="Games" tone="cyan" />
      </StatGrid>
    </Box>
  ),
};

export const Large: Story = {
  render: () => (
    <Box sx={{ maxWidth: 420 }}>
      <StatGrid>
        <StatCell size="lg" value="#1" label="Vote rank" tone="amber" />
        <StatCell size="lg" value="5/6" label="Around" />
        <StatCell size="lg" value="3h" label="Duration" tone="cyan" />
      </StatGrid>
    </Box>
  ),
};
