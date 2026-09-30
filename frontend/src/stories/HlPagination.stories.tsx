import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { HlPagination } from "../components/hl";

const Stateful = ({ total, pageSize }: { total: number; pageSize: number }) => {
  const [page, setPage] = useState(1);
  return (
    <HlPagination
      page={page}
      pageSize={pageSize}
      total={total}
      onChange={setPage}
    />
  );
};

const meta = {
  title: "HyperLAN/HlPagination",
  component: HlPagination,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { page: 1, pageSize: 9, total: 30, onChange: () => {} },
} satisfies Meta<typeof HlPagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = {};
export const Middle: Story = { args: { page: 6, pageSize: 12, total: 140 } };
export const LastPage: Story = { args: { page: 4 } };
export const Empty: Story = { args: { total: 0 } };
export const Interactive: Story = {
  render: () => <Stateful total={140} pageSize={12} />,
};
