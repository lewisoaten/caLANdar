import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import Dashboard from "../components/Dashboard";
import React from "react";

// Mock the UserProvider contexts
const mockUserContext = {
  email: "user@example.com",
  token: "mock-token",
  loggedIn: true,
  isAdmin: false,
};

const mockUserDispatchContext = {
  signIn: () => Promise.resolve(new Response()),
  verifyEmail: () => Promise.resolve(new Response()),
  signOut: () => {},
  isSignedIn: () => true,
};

// Create mock contexts
const UserContext = React.createContext(mockUserContext);
const UserDispatchContext = React.createContext(mockUserDispatchContext);

const meta = {
  title: "Components/Dashboard",
  component: Dashboard,
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", width: "100vw" }}>
        <BrowserRouter>
          <UserContext.Provider value={mockUserContext}>
            <UserDispatchContext.Provider value={mockUserDispatchContext}>
              <Story />
            </UserDispatchContext.Provider>
          </UserContext.Provider>
        </BrowserRouter>
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Main dashboard layout component that provides the application shell with navigation drawer, app bar, and content area.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Dashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContent: Story = {
  args: {
    children: (
      <div style={{ padding: "20px" }}>
        <h1>Welcome to caLANdar</h1>
        <p>This is the main content area of the dashboard.</p>
        <p>The navigation drawer on the left provides access to different sections of the application.</p>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: "Dashboard with sample content showing the layout structure.",
      },
    },
  },
};

export const Empty: Story = {
  args: {
    children: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: "Empty dashboard showing just the navigation structure.",
      },
    },
  },
};

export const WithCards: Story = {
  args: {
    children: (
      <div style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
          <div style={{ 
            backgroundColor: "#1e1e1e", 
            padding: "20px", 
            borderRadius: "8px",
            border: "1px solid #333"
          }}>
            <h3>Upcoming Events</h3>
            <p>LAN Party #1 - Next Weekend</p>
            <p>Gaming Tournament - Next Month</p>
          </div>
          <div style={{ 
            backgroundColor: "#1e1e1e", 
            padding: "20px", 
            borderRadius: "8px",
            border: "1px solid #333"
          }}>
            <h3>Recent Activity</h3>
            <p>John joined the party</p>
            <p>New game added: Counter-Strike</p>
          </div>
          <div style={{ 
            backgroundColor: "#1e1e1e", 
            padding: "20px", 
            borderRadius: "8px",
            border: "1px solid #333"
          }}>
            <h3>Your Games</h3>
            <p>5 games in library</p>
            <p>2 common with friends</p>
          </div>
        </div>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: "Dashboard with card-based content layout typical of a real application.",
      },
    },
  },
};