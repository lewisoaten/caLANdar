import * as React from "react";
import type { ContextType } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import theme from "../theme";
import { UserContext, UserDispatchContext } from "../UserProvider";

/** Render inside the real theme with a signed-in (admin by default) user. */
export function renderAsAdmin(ui: React.ReactElement, isAdmin = true) {
  const dispatch: ContextType<typeof UserDispatchContext> = {
    signIn: vi.fn(() => Promise.resolve({} as Response)),
    verifyEmail: vi.fn(() => Promise.resolve({} as Response)),
    signOut: vi.fn(),
    isSignedIn: vi.fn(() => true),
  };
  const utils = render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <UserContext.Provider
          value={{
            token: "admin-token",
            email: "admin@example.com",
            loggedIn: true,
            isAdmin,
          }}
        >
          <UserDispatchContext.Provider value={dispatch}>
            <SnackbarProvider>{ui}</SnackbarProvider>
          </UserDispatchContext.Provider>
        </UserContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { ...utils, dispatch };
}
