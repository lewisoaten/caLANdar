import type { Meta, StoryObj } from "@storybook/react";
import EventsAdminDialog from "../components/EventsAdminDialog";

const meta = {
  title: "Components/EventsAdminDialog",
  component: EventsAdminDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    open: { control: "boolean" },
  },
} satisfies Meta<typeof EventsAdminDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: {
    open: false,
    onClose: () => console.log("Dialog closed"),
  },
};

export const Open: Story = {
  args: {
    open: true,
    onClose: () => console.log("Dialog closed"),
  },
};
