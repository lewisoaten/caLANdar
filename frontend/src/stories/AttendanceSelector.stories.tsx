import type { Meta, StoryObj } from "@storybook/react";

import AttendanceSelector from "../components/AttendanceSelector";
import moment from "moment";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: "Example/AttendanceSelector",
  component: AttendanceSelector,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: "centered",
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ["autodocs"],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    timeBegin: { control: "date" },
    timeEnd: { control: "date" },
    colour: {
      control: "select",
      options: [
        "primary",
        "error",
        "secondary",
        "info",
        "success",
        "warning",
        "standard",
      ],
    },
  },
} satisfies Meta<typeof AttendanceSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Default: Story = {
  args: {
    timeBegin: moment(),
    value: [1, 0, 1, 0],
    timeEnd: moment().add(1, "days"),
    colour: "primary",
  },
};
