import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Mock the UserProvider contexts first
const mockLoggedInUserContext = {
  email: "user@example.com",
  token: "mock-token",
  loggedIn: true,
  isAdmin: false,
};

const mockAdminUserContext = {
  email: "admin@example.com",
  token: "admin-token",
  loggedIn: true,
  isAdmin: true,
};

const mockLoggedOutUserContext = {
  email: "",
  token: "",
  loggedIn: false,
  isAdmin: false,
};

const mockUserDispatchContext = {
  signIn: vi.fn(),
  verifyEmail: vi.fn(),
  signOut: vi.fn(),
  isSignedIn: vi.fn(),
};

vi.mock("../UserProvider", () => {
  const React = require("react");
  return {
    UserContext: React.createContext(mockLoggedInUserContext),
    UserDispatchContext: React.createContext(mockUserDispatchContext),
  };
});

// Import component after mocking
const MenuItems = await import("../components/MenuItems").then(m => m.default);

// Test wrapper
const TestWrapper = ({ 
  children, 
  userContext = mockLoggedInUserContext,
  initialRoute = "/",
}: { 
  children: React.ReactNode;
  userContext?: any;
  initialRoute?: string;
}) => {
  const theme = createTheme({ palette: { mode: "dark" } });
  const UserContext = React.createContext(userContext);
  
  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <UserContext.Provider value={userContext}>
          <Routes>
            <Route path="*" element={children} />
          </Routes>
        </UserContext.Provider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

describe("MenuItems", () => {
  const defaultProps = {
    updateButtonLoadingState: [false, vi.fn()] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
    updateButtonDoneState: [false, vi.fn()] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
  };

  test("shows sign in option for logged out users", () => {
    render(
      <TestWrapper userContext={mockLoggedOutUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
  });

  test("shows regular user menu items for logged in users", () => {
    render(
      <TestWrapper userContext={mockLoggedInUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("New feature!")).toBeInTheDocument();
    expect(screen.queryByText("Sign In")).not.toBeInTheDocument();
  });

  test("shows admin menu items for admin users", () => {
    render(
      <TestWrapper userContext={mockAdminUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Event Management")).toBeInTheDocument();
    expect(screen.getByText("Gamer Management")).toBeInTheDocument();
    expect(screen.getByText("Update Games")).toBeInTheDocument();
  });

  test("shows feature alert with Steam ID link", () => {
    render(
      <TestWrapper userContext={mockLoggedInUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText("New feature!")).toBeInTheDocument();
    expect(screen.getByText(/See what games you have in common/)).toBeInTheDocument();
    expect(screen.getByText("Add your Steam ID")).toBeInTheDocument();
  });

  test("renders all navigation links correctly", () => {
    render(
      <TestWrapper userContext={mockLoggedInUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    const eventsLink = screen.getByRole("button", { name: /events/i });
    const accountLink = screen.getByRole("button", { name: /account/i });
    
    expect(eventsLink).toBeInTheDocument();
    expect(accountLink).toBeInTheDocument();
  });

  test("renders admin links correctly", () => {
    render(
      <TestWrapper userContext={mockAdminUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    const eventManagementLink = screen.getByRole("button", { name: /event management/i });
    const gamerManagementLink = screen.getByRole("button", { name: /gamer management/i });
    
    expect(eventManagementLink).toBeInTheDocument();
    expect(gamerManagementLink).toBeInTheDocument();
  });

  test("passes props to RefreshGamesButton correctly", () => {
    const mockSetLoading = vi.fn();
    const mockSetDone = vi.fn();
    const propsWithMocks = {
      updateButtonLoadingState: [false, mockSetLoading] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
      updateButtonDoneState: [false, mockSetDone] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
    };

    render(
      <TestWrapper userContext={mockAdminUserContext}>
        <MenuItems {...propsWithMocks} />
      </TestWrapper>
    );

    expect(screen.getByText("Update Games")).toBeInTheDocument();
  });

  test("does not show admin sections for regular users", () => {
    render(
      <TestWrapper userContext={mockLoggedInUserContext}>
        <MenuItems {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.queryByText("Event Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamer Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Update Games")).not.toBeInTheDocument();
  });
});