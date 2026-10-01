import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { expect, within } from "storybook/test";
import { AuthHeroArt } from "../components/auth/AuthHeroArt";

/**
 * The generated artwork behind the signed-out pages (Sign in, Verify email).
 * Pure SVG + CSS, seeded, decorative (aria-hidden). The scene is pre-projected
 * into a few static layers; motion is compositor-only Web Animations.
 * `mode`: 'auto' picks 'full' on desktop and 'lite' (grid scroll + desk pulse)
 * on phones and low-power devices; 'still' is the static frame, which is also
 * what prefers-reduced-motion always gets. Motion pauses while the tab is
 * hidden, the art is off-screen, or a field is focused on a small screen.
 */
const meta = {
  title: "Components/Auth/AuthHeroArt",
  component: AuthHeroArt,
  parameters: { layout: "fullscreen", backgroundFx: false },
  tags: ["autodocs"],
  args: { seed: 2026, hud: true, mode: "auto" },
  argTypes: {
    mode: {
      control: "inline-radio",
      options: ["auto", "full", "lite", "still"],
    },
  },
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

/** Desktop motion set, forced (packets, beam flicker, tag bob, twinkles). */
export const Full: Story = {
  args: { mode: "full" },
  play: async ({ canvasElement }) => {
    const art = within(canvasElement).getByTestId("auth-hero-art");
    await expect(art.dataset.mode).toBe(
      matchMedia("(prefers-reduced-motion: reduce)").matches ? "still" : "full",
    );
  },
};

/** Phone motion set: only the grid scroll and the desk pulse. */
export const Lite: Story = {
  args: { mode: "lite" },
  parameters: { frame: { width: 390, height: 300 } },
};

/** The static frame (also what reduced motion gets). */
export const Still: Story = {
  args: { mode: "still" },
  play: async ({ canvasElement }) => {
    const art = within(canvasElement).getByTestId("auth-hero-art");
    await expect(art.dataset.mode).toBe("still");
    await expect(art.getAnimations({ subtree: true }).length).toBe(0);
  },
};

/** Without the HUD readouts. */
export const NoHud: Story = { args: { hud: false } };
