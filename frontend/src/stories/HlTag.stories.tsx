import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import BoltSharp from "@mui/icons-material/BoltSharp";
import { Tag, type HlTone } from "../components/hl";

const meta = {
  title: "HyperLAN/Tag",
  component: Tag,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { children: "You're in", tone: "lime" },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const tones: HlTone[] = ["cyan", "violet", "lime", "amber", "pink", "neutral"];

export const AllTones: Story = {
  render: () => (
    <Box sx={{ display: "grid", gap: 2 }}>
      {(["outline", "solid"] as const).map((variant) => (
        <Box key={variant} sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {tones.map((tone) => (
            <Tag key={tone} tone={tone} variant={variant}>
              {tone}
            </Tag>
          ))}
        </Box>
      ))}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Tag tone="lime" variant="solid" dot="pulse">
          Next up
        </Tag>
        <Tag tone="cyan" variant="solid">
          EVT-001
        </Tag>
        <Tag tone="amber" icon={<BoltSharp />}>
          Off-window
        </Tag>
        <Tag tone="lime" size="sm">
          Steam
        </Tag>
        <Tag tone="neutral" size="sm">
          No steam
        </Tag>
      </Box>
    </Box>
  ),
};
