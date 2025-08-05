import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { BrowserRouter } from "react-router-dom";
import RefreshGamesButton from "../components/RefreshGamesButton";
import React from "react";

const meta = {
  title: "Components/RefreshGamesButton",
  component: RefreshGamesButton,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Button component for refreshing Steam games data. Shows loading states and handles API calls for admin users.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof RefreshGamesButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultProps = {
  loadingState: [false, fn()] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
  doneState: [false, fn()] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
};

export const Default: Story = {
  args: defaultProps,
};

export const Loading: Story = {
  args: {
    loadingState: [true, fn()],
    doneState: [false, fn()],
  },
};

export const Completed: Story = {
  args: {
    loadingState: [false, fn()],
    doneState: [true, fn()],
  },
};