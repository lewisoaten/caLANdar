import { describe, test, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import VerifyEmail from "../components/VerifyEmail";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { UserProvider } from "../UserProvider";

const theme = createTheme({ palette: { mode: "dark" } });

// Set up MSW server
const server = setupServer(
  http.post("/api/verify-email", () => {
    return HttpResponse.json({ token: "mocked-token" }, { status: 200 });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Custom render without the BrowserRouter from test-utils
const renderWithRouter = (ui: React.ReactElement, initialEntries: string[] = ["/"]) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider theme={theme}>
        <UserProvider>{ui}</UserProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe("VerifyEmail", () => {
  test("renders verify email form", () => {
    renderWithRouter(
      <Routes>
        <Route path="/verify_email" element={<VerifyEmail />} />
      </Routes>,
      ["/verify_email"]
    );
    
    expect(screen.getByLabelText(/token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  test("renders with token from URL", () => {
    const token = "test-token-123";
    renderWithRouter(
      <Routes>
        <Route path="/verify_email" element={<VerifyEmail />} />
      </Routes>,
      [`/verify_email?token=${token}`]
    );
    
    const input = screen.getByLabelText(/token/i) as HTMLInputElement;
    expect(input.value).toBe(token);
  });

  test("renders title", () => {
    renderWithRouter(
      <Routes>
        <Route path="/verify_email" element={<VerifyEmail />} />
      </Routes>,
      ["/verify_email"]
    );
    
    expect(screen.getByText("Verify Email Token")).toBeInTheDocument();
  });

  test("has required token field", () => {
    renderWithRouter(
      <Routes>
        <Route path="/verify_email" element={<VerifyEmail />} />
      </Routes>,
      ["/verify_email"]
    );
    
    const input = screen.getByLabelText(/token/i);
    expect(input).toBeRequired();
  });
});
