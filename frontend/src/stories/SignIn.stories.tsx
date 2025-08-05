import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import SignIn from "../components/SignIn";
import React from "react";

const meta = {
  title: "Components/SignIn",
  component: SignIn,
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
        component: "Sign-in component that allows users to authenticate with their email address.",
      },
    },
    msw: {
      handlers: [
        // Mock successful sign-in
        {
          method: "POST",
          url: "/api/login",
          response: {
            status: 200,
            json: { token: "mock-token" },
          },
        },
      ],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Default sign-in form with email input and submit button.",
      },
    },
  },
};

export const WithError: Story = {
  parameters: {
    msw: {
      handlers: [
        {
          method: "POST",
          url: "/api/login",
          response: {
            status: 401,
            json: { error: "Invalid credentials" },
          },
        },
      ],
    },
    docs: {
      description: {
        story: "Shows how the component handles authentication errors.",
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        {
          method: "POST",
          url: "/api/login",
          response: {
            delay: 2000,
            status: 200,
            json: { token: "mock-token" },
          },
        },
      ],
    },
    docs: {
      description: {
        story: "Shows the loading state during authentication.",
      },
    },
  },
};