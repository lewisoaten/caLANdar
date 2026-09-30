import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FilterChips } from "../components/hl";

const options = [
  { id: "all", label: "All", count: 15 },
  { id: "live", label: "Live", count: 2 },
  { id: "draft", label: "Draft", count: 2 },
  { id: "ended", label: "Ended", count: 11 },
];

const Single = () => {
  const [value, setValue] = useState("all");
  return (
    <FilterChips
      label="Status"
      options={options}
      value={value}
      onChange={setValue}
    />
  );
};

const Multi = () => {
  const [value, setValue] = useState<string[]>(["event", "rsvp"]);
  return (
    <FilterChips
      multiple
      label="Entity type"
      value={value}
      onChange={setValue}
      options={[
        { id: "event", label: "Event" },
        { id: "rsvp", label: "RSVP" },
        { id: "seat", label: "Seat" },
        { id: "game", label: "Game" },
      ]}
    />
  );
};

const meta = {
  title: "HyperLAN/FilterChips",
  component: Single,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Single>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleSelect: Story = {};
export const MultiSelect: Story = { render: () => <Multi /> };
