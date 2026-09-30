import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import PersonSearchSharp from "@mui/icons-material/PersonSearchSharp";
import { SearchField } from "../components/hl";

const Stateful = (props: { initial?: string; person?: boolean }) => {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <SearchField
      label={props.person ? "Filter by user email" : "Search events"}
      value={value}
      onChange={setValue}
      icon={props.person ? <PersonSearchSharp aria-hidden="true" /> : undefined}
      sx={{ maxWidth: 420 }}
    />
  );
};

const meta = {
  title: "HyperLAN/SearchField",
  component: Stateful,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Stateful>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithValue: Story = { args: { initial: "autumn" } };
export const CustomIcon: Story = { args: { person: true } };
