import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { UserAvatar } from "../components/hl";

const meta = {
  title: "HyperLAN/UserAvatar",
  component: UserAvatar,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { name: "ProGamer123", size: 44 },
} satisfies Meta<typeof UserAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

export const WithImage: Story = {
  args: {
    decorative: false,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#151a28"/><circle cx="20" cy="16" r="8" fill="#36e6ff"/><rect x="8" y="28" width="24" height="12" fill="#8b5cff"/></svg>',
    )}`,
  },
};

export const BrokenImageFallsBack: Story = {
  args: { name: "LagWizard", src: "/does-not-exist.png" },
};

const names = [
  "ProGamer123",
  "LagWizard",
  "NoScope_Nia",
  "FragQueen",
  "CasualGamer",
  "Dan_the_Man",
  "SamTheSniper",
  "TurboTess",
  "",
];

export const Palette: Story = {
  render: () => (
    <Box
      sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "end" }}
    >
      {names.map((n) => (
        <UserAvatar key={n || "none"} name={n} size={40} />
      ))}
      {[22, 36, 64].map((s) => (
        <UserAvatar key={s} name="ProGamer123" size={s} />
      ))}
    </Box>
  ),
};
