import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import VerifyEmail, { verifyStepStates } from "../components/VerifyEmail";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { UserProvider } from "../UserProvider";

const theme = createTheme({ palette: { mode: "dark" } });

// Set up MSW server
const server = setupServer(
  http.post("/api/verify-email", () => {
    return HttpResponse.json({ token: "mocked-token" }, { status: 200 });
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
beforeEach(() => {
  // Clear localStorage before each test to ensure clean state
  localStorage.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Custom render without the BrowserRouter from test-utils
const renderWithRouter = (
  ui: React.ReactElement,
  initialEntries: string[] = ["/"],
) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider theme={theme}>
        <UserProvider>{ui}</UserProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
};

const routes = (
  <Routes>
    <Route path="/verify_email" element={<VerifyEmail />} />
    <Route path="/events" element={<div>Events Page</div>} />
  </Routes>
);

describe("VerifyEmail", () => {
  test("renders verify email form", () => {
    renderWithRouter(routes, ["/verify_email"]);

    expect(screen.getByLabelText("Token")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  test("renders title", () => {
    renderWithRouter(routes, ["/verify_email"]);

    expect(
      screen.getByRole("heading", { name: /verify email token/i }),
    ).toBeInTheDocument();
  });

  test("has required token field", () => {
    renderWithRouter(routes, ["/verify_email"]);

    const input = screen.getByLabelText("Token");
    expect(input).toBeRequired();
  });

  test("shows an inline error when submitted empty", async () => {
    renderWithRouter(routes, ["/verify_email"]);

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const input = screen.getByLabelText("Token");
    expect(input).toHaveAccessibleDescription(/paste the token/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("verifies a token from the URL automatically and shows progress", async () => {
    let received: unknown = null;
    server.use(
      http.post("/api/verify-email", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          { email: "sam@example.com", token: "mocked-token", isAdmin: false },
          { status: 200 },
        );
      }),
    );
    renderWithRouter(routes, ["/verify_email?token=test-token-123"]);

    expect(
      screen.getByRole("progressbar", { name: /sign-in progress/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Link token received")).toBeInTheDocument();

    expect(await screen.findByText("Events Page")).toBeInTheDocument();
    expect(received).toEqual({ token: "test-token-123" });
  });

  test("falls back to the form with the token when verification fails", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    server.use(
      http.post("/api/verify-email", () =>
        HttpResponse.json({}, { status: 400 }),
      ),
    );
    renderWithRouter(routes, ["/verify_email?token=bad-token"]);

    expect(
      await screen.findByRole("heading", { name: /link didn't work/i }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Token") as HTMLInputElement;
    expect(input.value).toBe("bad-token");
    expect(
      screen.getByRole("link", { name: /request a new login link/i }),
    ).toHaveAttribute("href", "/");
    alert.mockRestore();
  });
});

describe("verifyStepStates", () => {
  test("marks steps done / active / todo", () => {
    expect(verifyStepStates(0)).toEqual(["active", "todo", "todo"]);
    expect(verifyStepStates(1)).toEqual(["done", "active", "todo"]);
    expect(verifyStepStates(3)).toEqual(["done", "done", "done"]);
  });
});
