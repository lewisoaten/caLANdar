import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import SignIn from "../components/SignIn";
import { UserProvider } from "../UserProvider";

let loginBody: unknown = null;
const server = setupServer(
  http.post("/api/login", async ({ request }) => {
    loginBody = await request.json();
    return HttpResponse.json({}, { status: 200 });
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
beforeEach(() => {
  localStorage.clear();
  loginBody = null;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderSignIn = () =>
  render(
    <MemoryRouter>
      <UserProvider>
        <SignIn />
      </UserProvider>
    </MemoryRouter>,
  );

describe("SignIn", () => {
  test("renders the login form with one h1", () => {
    renderSignIn();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: /jump in/i })).toBeVisible();
    expect(screen.getByLabelText(/email/i)).toBeRequired();
  });

  test("validates the email inline", () => {
    renderSignIn();
    fireEvent.click(screen.getByRole("button", { name: /send login link/i }));
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/enter your email/i);
    expect(loginBody).toBeNull();
  });

  test("sends the link and shows the inbox state", async () => {
    renderSignIn();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send login link/i }));
    expect(
      await screen.findByRole("heading", { name: /check your inbox/i }),
    ).toBeInTheDocument();
    expect(loginBody).toMatchObject({ email: "sam@example.com" });
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /enter code manually/i }),
    ).toHaveAttribute("href", "/verify_email");

    fireEvent.click(screen.getByRole("button", { name: /use another email/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue("sam@example.com");
  });

  const failWith = (status: number, description: string) =>
    server.use(
      http.post("/api/login", () =>
        HttpResponse.json(
          { error: { code: status, reason: "x", description } },
          { status },
        ),
      ),
    );

  const submit = () => {
    renderSignIn();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send login link/i }));
  };

  test("shows the server's reason when sign-in is throttled", async () => {
    failWith(429, "Too many sign-in attempts. Please wait a while.");
    submit();
    expect(
      await screen.findByText(/too many sign-in attempts/i),
    ).toBeInTheDocument();
  });

  test("a failed human check is not blamed on the email address", async () => {
    failWith(
      400,
      "Could not verify you are human. Please refresh and try again.",
    );
    submit();
    expect(
      await screen.findByText(/could not verify you are human/i),
    ).toBeInTheDocument();
    // The error under the field is the server's, not the old "check the
    // address" guess.
    expect(screen.getByLabelText(/email/i)).not.toHaveAccessibleDescription(
      /invite came to/i,
    );
  });

  test("falls back to a neutral message when the server never answers", async () => {
    server.use(http.post("/api/login", () => HttpResponse.error()));
    submit();
    expect(
      await screen.findByText(/couldn't send a login link/i),
    ).toBeInTheDocument();
  });

  test("shows no CAPTCHA when no Turnstile site key is configured", () => {
    renderSignIn();
    expect(screen.queryByTestId("turnstile")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send login link/i }),
    ).toBeEnabled();
  });
});
