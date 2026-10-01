import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import moment from "moment";
import AttendanceSelector from "../components/AttendanceSelector";
import { lobbyTimes } from "./lobbyMocks";

/**
 * Attendance blocks: one toggle tile per 6-hour block of the event (on the
 * API's UTC grid). Without `onChange` it is a read-only summary.
 */
const meta = {
  title: "Components/AttendanceSelector",
  component: AttendanceSelector,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    colour: {
      control: "select",
      options: ["success", "warning", "error", "info", "secondary"],
    },
  },
  args: {
    timeBegin: moment(lobbyTimes.begin),
    timeEnd: moment(lobbyTimes.end),
  },
  render: function Render(args) {
    const [value, setValue] = React.useState(args.value);
    return (
      <div style={{ maxWidth: 640 }}>
        <AttendanceSelector
          {...args}
          value={value}
          onChange={args.onChange ? setValue : undefined}
        />
      </div>
    );
  },
} satisfies Meta<typeof AttendanceSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: [1, 1, 1, 1, 1, 1, 0, 0],
    colour: "success",
    onChange: () => {},
  },
};

/** Amber blocks for a "maybe". */
export const Maybe: Story = {
  args: {
    value: [1, 0, 1, 0, 0, 0, 0, 0],
    colour: "warning",
    onChange: () => {},
  },
};

export const ReadOnly: Story = {
  args: { value: [0, 0, 1, 1, 1, 1, 1, 0] },
};

export const Disabled: Story = {
  args: {
    value: [1, 1, 1, 1, 1, 1, 1, 1],
    onChange: () => {},
    disabled: true,
  },
};
