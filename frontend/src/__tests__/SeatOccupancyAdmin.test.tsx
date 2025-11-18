import { describe, it, expect, vi } from "vitest";
import type { ContextType } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SeatOccupancyAdmin from "../components/SeatOccupancyAdmin";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { SnackbarProvider } from "notistack";

const mockUserDetails = {
  token: "mock-admin-token",
  email: "admin@example.com",
  loggedIn: true,
  isAdmin: true,
};

const mockUserDispatch: ContextType<typeof UserDispatchContext> = {
  signIn: vi.fn(() => Promise.resolve({} as Response)),
  verifyEmail: vi.fn(() => Promise.resolve({} as Response)),
  signOut: vi.fn(),
  isSignedIn: vi.fn(() => true),
};

const renderComponent = (eventId = 1) => {
  return render(
    <MemoryRouter>
      <UserContext.Provider value={mockUserDetails}>
        <UserDispatchContext.Provider value={mockUserDispatch}>
          <SnackbarProvider>
            <SeatOccupancyAdmin eventId={eventId} />
          </SnackbarProvider>
        </UserDispatchContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>,
  );
};

describe("SeatOccupancyAdmin", () => {
  it("renders without crashing", () => {
    renderComponent();
    // Component should render something (either loading or content)
    expect(document.body).toBeInTheDocument();
  });

  it("renders with correct component structure", () => {
    const { container } = renderComponent();
    // Should render a Paper component (MUI)
    const paper = container.querySelector(".MuiPaper-root");
    expect(paper).toBeInTheDocument();
  });

  it("accepts eventId prop", () => {
    const { container } = renderComponent(123);
    expect(container).toBeInTheDocument();
  });

  it("accepts refreshTrigger prop", () => {
    render(
      <MemoryRouter>
        <UserContext.Provider value={mockUserDetails}>
          <UserDispatchContext.Provider value={mockUserDispatch}>
            <SnackbarProvider>
              <SeatOccupancyAdmin eventId={1} refreshTrigger={42} />
            </SnackbarProvider>
          </UserDispatchContext.Provider>
        </UserContext.Provider>
      </MemoryRouter>,
    );
    expect(document.body).toBeInTheDocument();
  });
});
