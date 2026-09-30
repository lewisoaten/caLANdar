import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import MenuItems from "../components/MenuItems";
import { colors } from "../components/hl/tokens";
import { withUser } from "./mockApi";
import { atPath, mockShellApi } from "./shellMocks";

/** The sidebar navigation (and mobile sheet list) on its own. */
const meta = {
  title: "Shell/MenuItems",
  component: MenuItems,
  parameters: { layout: "fullscreen", router: false },
  tags: ["autodocs"],
  decorators: [
    (Story, ctx) => {
      mockShellApi(
        "rsvp" in ctx.parameters
          ? (ctx.parameters.rsvp as "yes" | "maybe" | "no" | null)
          : "yes",
      );
      return (
        <Box
          sx={{
            width: 256,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            backgroundColor: colors.chrome,
            borderRight: "1px solid rgba(54,230,255,0.14)",
          }}
        >
          <Story />
        </Box>
      );
    },
  ],
} satisfies Meta<typeof MenuItems>;

export default meta;
type Story = StoryObj<typeof meta>;

const user = { email: "lewis@example.com" };

export const Default: Story = {
  decorators: [withUser({ ...user, isAdmin: false }), atPath("/events/901")],
};

export const AdminUser: Story = {
  decorators: [
    withUser({ ...user, isAdmin: true }),
    atPath("/admin/events/901"),
  ],
};

export const LockedEventPages: Story = {
  parameters: { rsvp: "no" },
  decorators: [withUser({ ...user, isAdmin: false }), atPath("/events/901")],
};

export const Sheet: Story = {
  args: { variant: "sheet", includeEvents: true },
  decorators: [withUser({ ...user, isAdmin: true }), atPath("/account")],
};

export const LoggedOut: Story = {
  decorators: [withUser({ loggedIn: false, token: "" }), atPath("/")],
};
