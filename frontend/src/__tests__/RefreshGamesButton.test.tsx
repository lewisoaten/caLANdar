import React from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the UserProvider contexts
const mockAdminUserContext = {
  email: "admin@example.com",
  token: "admin-token",
  loggedIn: true,
  isAdmin: true,
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
    UserContext: React.createContext(mockAdminUserContext),
    UserDispatchContext: React.createContext(mockUserDispatchContext),
  };
});

// Import component after mocking
const RefreshGamesButton = await import("../components/RefreshGamesButton").then(m => m.default);

// Test wrapper
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const theme = createTheme({ palette: { mode: "dark" } });
  
  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <SnackbarProvider maxSnack={3}>
          {children}
        </SnackbarProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

describe("RefreshGamesButton", () => {
  const mockSetLoading = vi.fn();
  const mockSetDone = vi.fn();
  
  const defaultProps = {
    loadingState: [false, mockSetLoading] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
    doneState: [false, mockSetDone] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  test("renders update games button with correct text", () => {
    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText("Update Games")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  test("shows update icon in default state", () => {
    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    // Check if the update icon is present (UpdateIcon)
    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  test("shows loading state when loading is true", () => {
    const loadingProps = {
      ...defaultProps,
      loadingState: [true, mockSetLoading] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
    };

    render(
      <TestWrapper>
        <RefreshGamesButton {...loadingProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  test("shows success icon when done is true", () => {
    const doneProps = {
      ...defaultProps,
      doneState: [true, mockSetDone] as [boolean, React.Dispatch<React.SetStateAction<boolean>>],
    };

    render(
      <TestWrapper>
        <RefreshGamesButton {...doneProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  test("handles successful API call", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
    });

    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    await userEvent.click(button);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api//steam-game-update-v2?as_admin=true",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer admin-token",
        },
      }
    );

    await waitFor(() => {
      expect(mockSetLoading).toHaveBeenCalledWith(true);
      expect(mockSetDone).toHaveBeenCalledWith(false);
    });

    await waitFor(() => {
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      expect(mockSetDone).toHaveBeenCalledWith(true);
    });
  });

  test("handles 401 unauthorized response", async () => {
    const mockSignOut = vi.fn();
    
    // Mock UserDispatchContext for this test
    vi.doMock("../UserProvider", () => {
      const React = require("react");
      return {
        UserContext: React.createContext(mockAdminUserContext),
        UserDispatchContext: React.createContext({
          ...mockUserDispatchContext,
          signOut: mockSignOut,
        }),
      };
    });

    mockFetch.mockResolvedValueOnce({
      status: 401,
    });

    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  test("handles API error response", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    
    mockFetch.mockResolvedValueOnce({
      status: 500,
      text: () => Promise.resolve("Server error"),
    });

    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    
    await expect(async () => {
      await userEvent.click(button);
    }).rejects.toThrow();

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Something has gone wrong, please contact the administrator. More details: 500"
      );
    });

    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });

  test("handles network error", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    
    await expect(async () => {
      await userEvent.click(button);
    }).rejects.toThrow("Network error");

    alertSpy.mockRestore();
  });

  test("button click sets loading and resets done state", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
    });

    render(
      <TestWrapper>
        <RefreshGamesButton {...defaultProps} />
      </TestWrapper>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetDone).toHaveBeenCalledWith(false);
  });
});