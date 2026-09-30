import type { Meta, StoryObj } from "@storybook/react-vite";
import Dashboard from "../components/Dashboard";
import { withUser } from "./mockApi";
import { DemoPage, atPath, mockShellApi } from "./shellMocks";

/**
 * The HyperLAN app shell with a fake API: sidebar with the active event card,
 * breadcrumb bar + status pill, live ticker on event pages and, at <= 760px,
 * the mobile top bar, bottom tab bar and menu sheet (use the viewport toolbar).
 */
const meta = {
  title: "Shell/Dashboard",
  component: Dashboard,
  parameters: { layout: "fullscreen", router: false },
  tags: ["autodocs"],
  decorators: [
    (Story, ctx) => {
      mockShellApi(
        "rsvp" in ctx.parameters
          ? (ctx.parameters.rsvp as "yes" | "maybe" | "no" | null)
          : "yes",
      );
      return <Story />;
    },
  ],
} satisfies Meta<typeof Dashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

const user = { email: "lewis@example.com" };

export const EventLobby: Story = {
  args: { children: <DemoPage title="Autumn LAN 2026" /> },
  decorators: [withUser({ ...user, isAdmin: true }), atPath("/events/901")],
};

export const EventSchedule: Story = {
  args: { children: <DemoPage title="Schedule" /> },
  decorators: [
    withUser({ ...user, isAdmin: true }),
    atPath("/events/901/schedule"),
  ],
};

export const EventsList: Story = {
  args: { children: <DemoPage title="Events" /> },
  decorators: [withUser({ ...user, isAdmin: false }), atPath("/events")],
};

export const AdminGamers: Story = {
  args: { children: <DemoPage title="Gamers" /> },
  decorators: [withUser({ ...user, isAdmin: true }), atPath("/admin/gamers")],
};

/** Not RSVP'd yet: Games / Seat map / Schedule are locked, no ticker. */
export const NotResponded: Story = {
  args: { children: <DemoPage title="Autumn LAN 2026" /> },
  parameters: { rsvp: null },
  decorators: [withUser({ ...user, isAdmin: false }), atPath("/events/901")],
};

export const Mobile: Story = {
  args: { children: <DemoPage title="Autumn LAN 2026" /> },
  globals: { viewport: { value: "mobile2", isRotated: false } },
  decorators: [withUser({ ...user, isAdmin: true }), atPath("/events/901")],
};

/** Signed out: sign-in / verify pages render full-screen without chrome. */
export const SignedOut: Story = {
  args: { children: <DemoPage title="Sign in" /> },
  decorators: [withUser({ loggedIn: false, token: "" }), atPath("/")],
};
