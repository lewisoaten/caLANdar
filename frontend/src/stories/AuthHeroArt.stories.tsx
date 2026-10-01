import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { expect, within } from "storybook/test";
import { AuthHeroArt } from "../components/auth/AuthHeroArt";

/**
 * The generated artwork behind the signed-out pages (Sign in, Verify email).
 * Pure SVG + CSS, seeded, decorative (aria-hidden). Motion stops under
 * prefers-reduced-motion; the still frame is the same composition.
 */
const meta = {
  title: "Components/Auth/AuthHeroArt",
  component: AuthHeroArt,
  parameters: { layout: "fullscreen", backgroundFx: false },
  tags: ["autodocs"],
  args: { seed: 2026, hud: true },
  decorators: [
    (Story, { parameters }) => (
      <Box
        sx={{
          position: "relative",
          width: parameters.frame?.width ?? 720,
          maxWidth: "100%",
          height: parameters.frame?.height ?? 900,
          overflow: "hidden",
        }}
      >
        <Story />
      </Box>
    ),
  ],
  play: async ({ canvasElement }) => {
    const art = within(canvasElement).getByTestId("auth-hero-art");
    await expect(art).toHaveAttribute("aria-hidden", "true");
    await expect(art.querySelectorAll("a,button,input,[tabindex]").length).toBe(
      0,
    );
  },
} satisfies Meta<typeof AuthHeroArt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop hero column (1440 x 900 viewport). */
export const Default: Story = {};

/** Wide desktop hero column (1920 x 1080 viewport). */
export const Wide: Story = {
  parameters: { frame: { width: 960, height: 1080 } },
};

/** Compact banner used above the form on phones. */
export const MobileBanner: Story = {
  parameters: {
    frame: { width: 390, height: 300 },
    viewport: { defaultViewport: "mobile1" },
  },
};

/** A different seed rearranges stars, skyline, desks and traces. */
export const OtherSeed: Story = { args: { seed: 7 } };

/** Without the HUD readouts. */
export const NoHud: Story = { args: { hud: false } };
