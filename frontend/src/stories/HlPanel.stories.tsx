import type { Meta, StoryObj } from "@storybook/react-vite";
import Button from "@mui/material/Button";
import { Panel, Tag } from "../components/hl";

const meta = {
  title: "HyperLAN/Panel",
  component: Panel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    children:
      "Panel body. Translucent surface, hairline border and the cyan corner bracket.",
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { kicker: "Your RSVP" } };

export const WithHeader: Story = {
  args: {
    title: "Squad",
    actions: (
      <>
        <Tag tone="lime" size="sm">
          5 IN
        </Tag>
        <Tag tone="amber" size="sm">
          1 MAYBE
        </Tag>
        <Button size="small" variant="outlined">
          Invite
        </Button>
      </>
    ),
  },
};

export const BothBrackets: Story = {
  args: { bracket: "both", kicker: "Hero" },
};

export const AmberAdminCard: Story = {
  args: {
    tone: "amber",
    kicker: "Server · Steam game cache",
    children: "48,213 games cached · refreshed 3 days ago",
  },
};

export const EdgeToEdgeList: Story = {
  args: {
    title: "Audit log",
    padding: "none",
    children: (
      <div>
        {["One", "Two", "Three"].map((row) => (
          <div
            key={row}
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid rgba(54,230,255,0.07)",
            }}
          >
            {row}
          </div>
        ))}
      </div>
    ),
  },
};
