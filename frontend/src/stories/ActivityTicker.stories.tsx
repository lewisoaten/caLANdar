import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { ActivityTickerView } from "../components/ActivityTicker";
import { tickerItems } from "./shellMocks";

/** The 44px LIVE ticker (presentational view; the shell feeds it from the API). */
const meta = {
  title: "Shell/ActivityTicker",
  component: ActivityTickerView,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <Box sx={{ minHeight: 200, display: "flex", alignItems: "flex-end" }}>
        <Box sx={{ width: "100%" }}>
          <Story />
        </Box>
      </Box>
    ),
  ],
} satisfies Meta<typeof ActivityTickerView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { items: tickerItems } };

export const SingleItem: Story = { args: { items: tickerItems.slice(0, 1) } };

export const Empty: Story = { args: { items: [] } };
