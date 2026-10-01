import type { Meta, StoryObj } from "@storybook/react-vite";
import VerifyEmail from "../components/VerifyEmail";
import { UserProvider } from "../UserProvider";
import { mockApi, type MockRequest } from "./mockApi";
import {
  MemoryRouter,
  Route,
  Routes,
  useInRouterContext,
} from "react-router-dom";

mockApi({
  "POST /api/verify-email": (req: MockRequest) => {
    const { token } = (req.body ?? {}) as { token?: string };
    // "pending-token" never resolves, to show the in-progress state.
    if (token === "pending-token") return new Promise(() => {});
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            email: "sam@example.com",
            token: "storybook-token",
            isAdmin: false,
          }),
        1500,
      ),
    );
  },
});

// Wrapper to provide routing context
const VerifyEmailWrapper = (args: { token?: string }) => {
  // Already under a Router (e.g. a host that wraps everything in one): render
  // the component directly instead of nesting a second Router.
  const inRouter = useInRouterContext();
  if (inRouter)
    return (
      <UserProvider>
        <VerifyEmail />
      </UserProvider>
    );

  const searchParams = args.token ? `?token=${args.token}` : "";

  return (
    <MemoryRouter initialEntries={[`/verify_email${searchParams}`]}>
      <UserProvider>
        <Routes>
          <Route path="/verify_email" element={<VerifyEmail />} />
          <Route path="/events" element={<div>Events Page</div>} />
        </Routes>
      </UserProvider>
    </MemoryRouter>
  );
};

const meta = {
  title: "Components/VerifyEmail",
  component: VerifyEmailWrapper,
  parameters: {
    layout: "fullscreen",
    // The wrapper mounts its own MemoryRouter; skip the global one.
    router: false,
  },
  tags: ["autodocs"],
  // Start signed out, and don't leak the session a successful verify stores.
  beforeEach: () => {
    localStorage.removeItem("user_context");
    return () => localStorage.removeItem("user_context");
  },
} satisfies Meta<typeof VerifyEmailWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default story - no token provided: manual entry form
export const Default: Story = {
  args: {},
};

// With token in URL: verifies automatically, then goes to /events
export const WithToken: Story = {
  args: {
    token: "example-token-123",
  },
};

// Verification in progress (the request never completes)
export const Verifying: Story = {
  args: {
    token: "pending-token",
  },
};
