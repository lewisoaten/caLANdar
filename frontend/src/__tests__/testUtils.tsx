import React from "react";
import { vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";

// Common test wrapper that provides necessary contexts
export const TestWrapper = ({ children }: { children: React.ReactNode }) => {
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

// Mock user context values
export const mockUserContext = {
  email: "test@example.com",
  token: "mock-token",
  loggedIn: true,
  isAdmin: false,
};

export const mockAdminUserContext = {
  email: "admin@example.com", 
  token: "admin-token",
  loggedIn: true,
  isAdmin: true,
};

export const mockLoggedOutUserContext = {
  email: "",
  token: "",
  loggedIn: false,
  isAdmin: false,
};

export const mockUserDispatchContext = {
  signIn: vi.fn(() => Promise.resolve(new Response())),
  verifyEmail: vi.fn(() => Promise.resolve(new Response())),
  signOut: vi.fn(),
  isSignedIn: vi.fn(() => true),
};

// Common setup function for UserProvider mocks
export const setupUserProviderMock = (userContext = mockUserContext) => {
  vi.mock("../UserProvider", () => {
    const React = require("react");
    return {
      UserProvider: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
      UserContext: React.createContext(userContext),
      UserDispatchContext: React.createContext(mockUserDispatchContext),
    };
  });
};