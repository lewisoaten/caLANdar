import type { Meta, StoryObj } from "@storybook/react";
import { fn, userEvent, within, expect } from "@storybook/test";
import { BrowserRouter } from "react-router-dom";
import RefreshGamesButton from "../components/RefreshGamesButton";
import React from "react";

// Mock the UserProvider contexts
const mockUserContext = {
  email: "admin@example.com",
  token: "mock-token",
  loggedIn: true,
  isAdmin: true,
};

const mockUserDispatchContext = {
  signIn: fn(),
  verifyEmail: fn(),
  signOut: fn(),
  isSignedIn: fn(),
};

// Create mock contexts
const UserContext = React.createContext(mockUserContext);
const UserDispatchContext = React.createContext(mockUserDispatchContext);

// Mock the UserProvider module
export default {
  title: "Components/RefreshGamesButton",
  component: RefreshGamesButton,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <UserContext.Provider value={mockUserContext}>
          <UserDispatchContext.Provider value={mockUserDispatchContext}>
            <Story />
          </UserContext.Provider>
        </UserDispatchContext.Provider>
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
    msw: {
      handlers: [
        // Mock successful API response
        {
          method: "POST",
          url: "/api/steam-game-update-v2?as_admin=true",
          response: {
            status: 200,
          },
        },
      ],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    loadingState: {
      description: "State tuple for managing loading state",
      control: { type: "object" },
    },
    doneState: {
      description: "State tuple for managing completion state",
      control: { type: "object" },
    },
  },
} satisfies Meta<typeof RefreshGamesButton>;

type Story = StoryObj<typeof RefreshGamesButton>;

// Create state hooks for stories
const useLoadingState = (initial = false): [boolean, React.Dispatch<React.SetStateAction<boolean>>] => {
  const [loading, setLoading] = React.useState(initial);
  return [loading, setLoading];
};

const useDoneState = (initial = false): [boolean, React.Dispatch<React.SetStateAction<boolean>>] => {
  const [done, setDone] = React.useState(initial);
  return [done, setDone];
};

export const Default: Story = {
  args: {
    loadingState: [false, fn()],
    doneState: [false, fn()],
  },
  render: (args) => {
    const loadingState = useLoadingState();
    const doneState = useDoneState();
    
    return (
      <RefreshGamesButton 
        loadingState={loadingState}
        doneState={doneState}
      />
    );
  },
};

export const Loading: Story = {
  args: {
    loadingState: [true, fn()],
    doneState: [false, fn()],
  },
  render: (args) => {
    const loadingState = useLoadingState(true);
    const doneState = useDoneState();
    
    return (
      <RefreshGamesButton 
        loadingState={loadingState}
        doneState={doneState}
      />
    );
  },
};

export const Completed: Story = {
  args: {
    loadingState: [false, fn()],
    doneState: [true, fn()],
  },
  render: (args) => {
    const loadingState = useLoadingState();
    const doneState = useDoneState(true);
    
    return (
      <RefreshGamesButton 
        loadingState={loadingState}
        doneState={doneState}
      />
    );
  },
};

export const Interactive: Story = {
  render: () => {
    const loadingState = useLoadingState();
    const doneState = useDoneState();
    
    return (
      <RefreshGamesButton 
        loadingState={loadingState}
        doneState={doneState}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    
    // Initial state should show update icon
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    
    // Click the button to trigger loading
    await userEvent.click(button);
    
    // Note: In a real test, you would verify the loading state changes
    // but since this is a story, the mock API will resolve immediately
  },
};