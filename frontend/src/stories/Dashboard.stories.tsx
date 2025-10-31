import type { Meta, StoryObj } from "@storybook/react";
import Dashboard from "../components/Dashboard";

const meta = {
  title: "Components/Dashboard",
  component: Dashboard,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Dashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContent: Story = {
  args: {
    children: (
      <div style={{ padding: "20px" }}>
        <h1>Dashboard Content</h1>
        <p>This is where the main content goes.</p>
      </div>
    ),
  },
};

export const Empty: Story = {
  args: {
    children: <div />,
  },
};
