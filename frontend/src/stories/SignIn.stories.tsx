import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import SignIn from "../components/SignIn";
import { UserProvider } from "../UserProvider";
import { mockApi } from "./mockApi";

mockApi({
  "POST /api/login": () => new Promise((r) => setTimeout(() => r({}), 400)),
});

const meta = {
  title: "Components/SignIn",
  component: SignIn,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  // A stored session would redirect straight to /events.
  beforeEach: () => {
    localStorage.removeItem("user_context");
  },
  decorators: [
    (Story) => (
      <UserProvider>
        <Story />
      </UserProvider>
    ),
  ],
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** After submitting: the "Check your inbox" state. */
export const LinkSent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/email/i), "sam@example.com");
    await userEvent.click(
      canvas.getByRole("button", { name: /send login link/i }),
    );
    await expect(
      await canvas.findByRole("heading", { name: /check your inbox/i }),
    ).toBeTruthy();
  },
};

/** Client-side validation: the error is announced and tied to the field. */
export const InvalidEmail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(
      canvas.getByRole("button", { name: /send login link/i }),
    );
    await expect(
      await canvas.findByText(/doesn't look like an email/i),
    ).toBeTruthy();
  },
};
