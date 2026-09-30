import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kicker } from "../components/hl";

const meta = {
  title: "HyperLAN/Kicker",
  component: Kicker,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { children: "Your invites" },
} satisfies Meta<typeof Kicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Admin: Story = { args: { tone: "amber", children: "Admin" } };
export const Live: Story = { args: { tone: "lime", children: "Lan party OS" } };
export const NoPrefix: Story = { args: { prefix: false, children: "Email" } };
