import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import * as React from "react";
import Box from "@mui/material/Box";
import {
  SeatFloorPlan,
  FloorPlanLegend,
  type FloorPlanDesk,
} from "../components/SeatFloorPlan";
import type { FloorPlanSeat } from "../components/seatFloorPlanModel";
import {
  designSeats,
  gamesRoom,
  mainHall,
  roomPhoto,
  stamp,
} from "./seatMapFixtures";

const seats = designSeats(1);
const hall = seats.filter((s) => s.roomId === 1);

const taken: Record<string, string> = {
  A1: "NoScope_Nia",
  B1: "CasualGamer",
  B2: "LagWizard",
};

const designDesks = (selected?: string): FloorPlanDesk[] =>
  hall.map((seat) => ({
    seat,
    state:
      seat.label === "A4"
        ? "mine"
        : taken[seat.label]
          ? "taken"
          : seat.label === selected
            ? "selected"
            : "free",
    occupants:
      seat.label === "A4"
        ? [{ name: "ProGamer123" }]
        : taken[seat.label]
          ? [{ name: taken[seat.label] }]
          : [],
  }));

/** Click a free desk to select it; click again to clear. */
function Interactive() {
  const [selected, setSelected] = React.useState<string | undefined>("A3");
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <SeatFloorPlan
        room={mainHall(1)}
        desks={designDesks(selected)}
        label="Main Hall floor plan"
        onDeskSelect={(seat) =>
          setSelected((cur) => (cur === seat.label ? undefined : seat.label))
        }
      />
      <FloorPlanLegend items={["mine", "free", "taken", "selected"]} />
    </Box>
  );
}

// Seats from the old free-form editor: x/y only, several close together.
const legacySeats: FloorPlanSeat[] = [
  [0.2, 0.3],
  [0.22, 0.31],
  [0.4, 0.3],
  [0.6, 0.3],
  [0.8, 0.3],
  [0.2, 0.7],
  [0.5, 0.7],
  [0.52, 0.72],
].map(([x, y], i) => ({
  id: 100 + i,
  eventId: 1,
  roomId: 3,
  label: `L${i + 1}`,
  description: null,
  x,
  y,
  createdAt: stamp,
  lastModified: stamp,
}));

const meta = {
  title: "Components/SeatFloorPlan",
  component: SeatFloorPlan,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <Box sx={{ maxWidth: 900 }}>
        <Story />
      </Box>
    ),
  ],
  args: { onDeskSelect: fn() },
} satisfies Meta<typeof SeatFloorPlan>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Yours (lime), free (cyan outline), taken (violet with avatar), selected (cyan + glow). */
export const AllStates: Story = {
  args: {
    room: mainHall(1),
    desks: designDesks("A3"),
    label: "Main Hall floor plan",
  },
};

/** Stateful: select and deselect desks with the mouse or keyboard (arrows move between desks). */
export const Selectable: Story = {
  args: { room: mainHall(1), desks: [], label: "Main Hall floor plan" },
  render: () => <Interactive />,
};

/** An uploaded background plan with the Retro treatment (greyscale, cyan tint, scanlines). */
export const RetroBackground: Story = {
  args: {
    room: mainHall(1, { backgroundUrl: roomPhoto, backgroundOpacity: 0.7 }),
    desks: designDesks(),
    label: "Main Hall floor plan",
  },
};

/** The same plan shown as the Original image at 40%. */
export const OriginalBackground: Story = {
  args: {
    room: mainHall(1, {
      backgroundUrl: roomPhoto,
      backgroundStyle: "original",
      backgroundOpacity: 0.4,
    }),
    desks: designDesks(),
    label: "Main Hall floor plan",
  },
};

/** A 5-row room. */
export const SmallRoom: Story = {
  args: {
    room: gamesRoom(1),
    desks: seats
      .filter((s) => s.roomId === 2)
      .map((seat, i) => ({
        seat,
        state: i === 0 ? "taken" : "free",
        occupants: i === 0 ? [{ name: "SamTheSniper" }] : [],
      })),
    label: "Games Room floor plan",
  },
};

/** Legacy room: no grid, seats placed from x/y (collisions move to the next free cell). */
export const LegacySeats: Story = {
  args: {
    room: {
      ...mainHall(1, { features: [], gridRows: null }),
      id: 3,
      name: "Old Hall",
    },
    desks: legacySeats.map((seat, i) => ({
      seat,
      state: i % 3 === 0 ? "taken" : "free",
      occupants:
        i % 3 === 0 ? [{ name: "Someone_with_a_really_long_handle" }] : [],
    })),
    label: "Old Hall floor plan",
  },
};

/** Read-only (no selection handler): every desk is inert. */
export const ReadOnly: Story = {
  args: {
    room: mainHall(1),
    desks: designDesks().map((d) => ({ ...d, disabled: true })),
    label: "Main Hall floor plan",
    selectable: false,
    onDeskSelect: undefined,
  },
};

const longLabels = [
  "Window seat 12",
  "ABCDEFGH",
  "WWWWWWWW",
  "Desk-12",
  "A1",
  "Legacy seat with a long name",
];

/**
 * Long identifiers (8 characters) and legacy labels from before the limit:
 * every tile stays one grid square; the label shrinks, then ellipsises, and
 * the full text plus the description are in the tooltip and accessible name.
 */
export const LongLabels: Story = {
  args: {
    room: mainHall(1),
    desks: hall.slice(0, longLabels.length).map((seat, i) => ({
      seat: {
        ...seat,
        label: longLabels[i],
        description: i === 0 ? "Window desk next to the fridge" : null,
      },
      state:
        i === 2 ? "taken" : i === 3 ? "mine" : i === 4 ? "selected" : "free",
      occupants:
        i === 2
          ? [{ name: "NoScope_Nia" }]
          : i === 3
            ? [{ name: "ProGamer123" }]
            : [],
    })),
    label: "Main Hall floor plan",
  },
};

/** The long labels on a phone (the plan scrolls sideways at 44px cells). */
export const LongLabelsMobile: Story = {
  ...LongLabels,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
