import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SeatOccupancyAdmin from "../components/SeatOccupancyAdmin";
import { UserProvider } from "../UserProvider";
import { SnackbarProvider } from "notistack";

const mockUserDetails = {
  token: "mock-admin-token",
  email: "admin@example.com",
  avatarUrl: null,
};

const renderComponent = (eventId = 1) => {
  return render(
    <MemoryRouter>
      <UserProvider value={mockUserDetails}>
        <SnackbarProvider>
          <SeatOccupancyAdmin eventId={eventId} />
        </SnackbarProvider>
      </UserProvider>
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
        <UserProvider value={mockUserDetails}>
          <SnackbarProvider>
            <SeatOccupancyAdmin eventId={1} refreshTrigger={42} />
          </SnackbarProvider>
        </UserProvider>
      </MemoryRouter>,
    );
    expect(document.body).toBeInTheDocument();
  });
});

