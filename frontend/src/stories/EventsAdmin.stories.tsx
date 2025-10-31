import type { Meta, StoryObj } from "@storybook/react";
import EventsAdmin from "../components/EventsAdmin";

const meta = {
  title: "Components/EventsAdmin",
  component: EventsAdmin,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof EventsAdmin>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
