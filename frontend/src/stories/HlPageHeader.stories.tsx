import type { Meta, StoryObj } from "@storybook/react-vite";
import Button from "@mui/material/Button";
import AddSharp from "@mui/icons-material/AddSharp";
import { FilterChips, PageHeader, SearchField } from "../components/hl";

const meta = {
  title: "HyperLAN/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Events: Story = {
  args: {
    kicker: "Your invites",
    title: "Events",
    actions: (
      <FilterChips
        label="Show"
        value="upcoming"
        onChange={() => {}}
        options={[
          { id: "upcoming", label: "Upcoming" },
          { id: "past", label: "Past" },
          { id: "all", label: "All" },
        ]}
      />
    ),
  },
};

export const AdminWithCta: Story = {
  args: {
    kicker: "Admin",
    kickerTone: "amber",
    title: "Manage events",
    actions: (
      <Button
        variant="contained"
        color="warning"
        size="large"
        startIcon={<AddSharp />}
      >
        New event
      </Button>
    ),
  },
};

export const WithSearchAndDescription: Story = {
  args: {
    kicker: "Admin",
    kickerTone: "amber",
    title: "Gamers",
    description:
      "Everyone who has been invited to an event, with their Steam link status.",
    actions: (
      <SearchField
        label="Search email or callsign"
        value=""
        onChange={() => {}}
        sx={{ width: 420, maxWidth: "100%" }}
      />
    ),
  },
};
