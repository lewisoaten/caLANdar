import React from "react";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../App";

// Mock the Views component since it has complex dependencies
vi.mock("../Views", () => ({
  default: () => <div>Mocked Views</div>,
}));

// Mock UserProvider context
vi.mock("../UserProvider", () => {
  const React = require("react");
  return {
    UserProvider: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    UserContext: React.createContext({
      email: "",
      token: "",
      loggedIn: false,
      isAdmin: false,
    }),
    UserDispatchContext: React.createContext({
      signIn: vi.fn(),
      verifyEmail: vi.fn(),
      signOut: vi.fn(),
      isSignedIn: vi.fn(),
    }),
  };
});

test("renders dashboard with caLANdar branding", () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  
  const linkElement = screen.getByText(/caLANdar/i);
  expect(linkElement).toBeInTheDocument();
});
