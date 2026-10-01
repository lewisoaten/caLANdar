import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import GameCoverImage from "../components/GameCoverImage";
import {
  markLegacyHeaderFailed,
  markResolvedCoverFailed,
} from "../utils/gameCover";
import { stubImages } from "./mockApi";

stubImages();

/** A game with no art anywhere: starts straight on the fallback banner. */
const NO_ART = 3949040;
markLegacyHeaderFailed(NO_ART);
markResolvedCoverFailed(NO_ART);

const SIZES: ReadonlyArray<[width: number, height?: number]> = [
  [460],
  [120, 56],
  [92, 43],
  [84, 39],
  [76, 35],
  [60, 28],
];

function Sizes({ appid, name }: { appid: number; name: string }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "end" }}>
      {SIZES.map(([width, height]) => (
        <GameCoverImage
          key={`${width}x${height ?? ""}`}
          appid={appid}
          name={name}
          width={width}
          height={height}
        />
      ))}
    </Box>
  );
}

const meta = {
  title: "Components/GameCoverImage",
  component: Sizes,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Sizes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The legacy Steam header loads. */
export const SteamHeader: Story = {
  args: { appid: 550, name: "Left 4 Dead 2" },
};

/** No Steam art: the default banner, darkened, captioned with the name. */
export const Fallback: Story = {
  args: { appid: NO_ART, name: "RV There Yet?" },
};
