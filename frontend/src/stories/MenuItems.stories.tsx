import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { BrowserRouter } from "react-router-dom";
import MenuItems from "../components/MenuItems";
import React from "react";

const meta = {
  title: "Components/MenuItems",
  component: MenuItems,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: "Navigation menu component that shows different options based on user authentication and admin status.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MenuItems>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultProps = {
  updateButtonLoadingState: [false, fn()] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
  updateButtonDoneState: [false, fn()] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
};

export const Default: Story = {
  args: defaultProps,
};

export const WithLoadingState: Story = {
  args: {
    updateButtonLoadingState: [true, fn()],
    updateButtonDoneState: [false, fn()],
  },
};

export const WithCompletedState: Story = {
  args: {
    updateButtonLoadingState: [false, fn()],
    updateButtonDoneState: [true, fn()],
  },
};