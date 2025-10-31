import type { Meta, StoryObj } from "@storybook/react";
import SignIn from "../components/SignIn";

const meta = {
  title: "Components/SignIn",
  component: SignIn,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
