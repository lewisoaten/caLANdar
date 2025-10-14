import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import VerifyEmail from "../components/VerifyEmail";
import React from "react";

// Mock the UserProvider contexts
const mockUserContext = {
  email: "",
  token: "",
  loggedIn: false,
  isAdmin: false,
};

const mockUserDispatchContext = {
  signIn: () => Promise.resolve(new Response()),
  verifyEmail: () => Promise.resolve(new Response()),
  signOut: () => {},
  isSignedIn: () => false,
};

// Create mock contexts
const UserContext = React.createContext(mockUserContext);
const UserDispatchContext = React.createContext(mockUserDispatchContext);

const meta = {
  title: "Components/VerifyEmail",
  component: VerifyEmail,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <UserContext.Provider value={mockUserContext}>
          <UserDispatchContext.Provider value={mockUserDispatchContext}>
            <Story />
          </UserDispatchContext.Provider>
        </UserContext.Provider>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Email verification component that allows users to verify their email address using a token.",
      },
    },
    msw: {
      handlers: [
        // Mock successful verification
        {
          method: "POST",
          url: "/api/verify",
          response: {
            status: 200,
          },
        },
      ],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof VerifyEmail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Default email verification form with instructions and token input field.",
      },
    },
  },
};

export const WithValidationError: Story = {
  parameters: {
    msw: {
      handlers: [
        {
          method: "POST",
          url: "/api/verify",
          response: {
            status: 400,
            json: { error: "Invalid token" },
          },
        },
      ],
    },
    docs: {
      description: {
        story: "Shows how the component handles validation errors from the API.",
      },
    },
  },
};

export const WithServerError: Story = {
  parameters: {
    msw: {
      handlers: [
        {
          method: "POST",
          url: "/api/verify",
          response: {
            status: 500,
            json: { error: "Server error" },
          },
        },
      ],
    },
    docs: {
      description: {
        story: "Shows how the component handles server errors.",
      },
    },
  },
};