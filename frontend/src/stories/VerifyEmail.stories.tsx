import type { Meta, StoryObj } from "@storybook/react";
import VerifyEmail from "../components/VerifyEmail";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Wrapper to provide routing context
const VerifyEmailWrapper = (args: { token?: string }) => {
  const searchParams = args.token ? `?token=${args.token}` : "";
  
  return (
    <MemoryRouter initialEntries={[`/verify_email${searchParams}`]}>
      <Routes>
        <Route path="/verify_email" element={<VerifyEmail />} />
        <Route path="/events" element={<div>Events Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

const meta = {
  title: "Components/VerifyEmail",
  component: VerifyEmailWrapper,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof VerifyEmailWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default story - no token provided
export const Default: Story = {
  args: {},
};

// With token in URL
export const WithToken: Story = {
  args: {
    token: "example-token-123",
  },
};
