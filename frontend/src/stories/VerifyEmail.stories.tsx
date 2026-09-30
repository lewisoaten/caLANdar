import type { Meta, StoryObj } from "@storybook/react-vite";
import VerifyEmail from "../components/VerifyEmail";
import {
  MemoryRouter,
  Route,
  Routes,
  useInRouterContext,
} from "react-router-dom";

// Wrapper to provide routing context
const VerifyEmailWrapper = (args: { token?: string }) => {
  // Already under a Router (e.g. a host that wraps everything in one): render
  // the component directly instead of nesting a second Router.
  const inRouter = useInRouterContext();
  if (inRouter) return <VerifyEmail />;

  const searchParams = args.token ? `?token=${args.token}` : "";

  return (
    <MemoryRouter initialEntries={[`/verify_email${searchParams}`]}>
      <Routes>
        <Route path="/verify_email" element={<VerifyEmail />} />
        <Route path="/events" element={<div>Events Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

const meta = {
  title: "Components/VerifyEmail",
  component: VerifyEmailWrapper,
  parameters: {
    layout: "centered",
    // The wrapper mounts its own MemoryRouter; skip the global one.
    router: false,
  },
  tags: ["autodocs"],
} satisfies Meta<typeof VerifyEmailWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default story - no token provided
export const Default: Story = {
  args: {},
};

// With token in URL
export const WithToken: Story = {
  args: {
    token: "example-token-123",
  },
};
