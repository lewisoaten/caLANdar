import type { Meta, StoryObj } from "@storybook/react-vite";
import Button from "@mui/material/Button";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import { EmptyState, Panel } from "../components/hl";

const meta = {
  title: "HyperLAN/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    title: "No events yet",
    description: "When you're invited to a LAN it shows up here.",
    icon: <EventBusySharp />,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  render: (args) => (
    <Panel padding="none">
      <EmptyState {...args} />
    </Panel>
  ),
};

export const FramedWithAction: Story = {
  args: {
    variant: "panel",
    kicker: "No results",
    title: "No entries match those filters",
    description: undefined,
    action: <Button variant="outlined">Clear filters</Button>,
  },
};
