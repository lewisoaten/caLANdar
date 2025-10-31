import type { Meta, StoryObj } from "@storybook/react";
import MenuItems from "../components/MenuItems";
import { useState } from "react";

// Wrapper for state management
const MenuItemsWrapper = () => {
  const updateButtonLoadingState = useState(false);
  const updateButtonDoneState = useState(false);

  return (
    <MenuItems
      updateButtonLoadingState={updateButtonLoadingState}
      updateButtonDoneState={updateButtonDoneState}
    />
  );
};

const meta = {
  title: "Components/MenuItems",
  component: MenuItemsWrapper,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MenuItemsWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LoggedOut: Story = {
  parameters: {
    // Mock UserContext as logged out
  },
};

export const AdminUser: Story = {
  parameters: {
    // Mock UserContext as admin
  },
};
