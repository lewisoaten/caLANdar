import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";
import {
  SeatFloorPlan,
  FloorPlanLegend,
  seatAriaLabel,
  seatSubLabel,
  seatTitle,
  type SeatTile,
} from "../components/SeatFloorPlan";
import type {
  FloorPlanRoom,
  FloorPlanSeat,
} from "../components/seatFloorPlanModel";

const stamp = moment.utc("2026-01-01T00:00:00Z");

const room: FloorPlanRoom = {
  id: 1,
  eventId: 1,
  name: "Main Hall",
  description: null,
  image: null,
  sortOrder: 0,
  createdAt: stamp,
  lastModified: stamp,
  gridRows: 8,
  features: [
    ...[3, 4, 5, 6, 7, 8].map((col) => ({ col, row: 0, kind: "screen" })),
    { col: 5, row: 7, kind: "entrance" },
    { col: 6, row: 7, kind: "entrance" },
  ],
  backgroundUrl: "/api/room-backgrounds/abc",
  backgroundStyle: "retro",
  backgroundOpacity: 0.5,
};

const seat = (
  id: number,
  label: string,
  gridCol: number,
  gridRow: number,
  description: string | null = null,
): FloorPlanSeat => ({
  id,
  eventId: 1,
  roomId: 1,
  label,
  description,
  x: 0,
  y: 0,
  gridCol,
  gridRow,
  createdAt: stamp,
  lastModified: stamp,
});

const tiles = (): SeatTile[] => [
  {
    seat: seat(1, "A1", 2, 2, "Front row"),
    state: "taken",
    occupants: [{ name: "NoScope_Nia" }],
  },
  { seat: seat(2, "A2", 4, 2), state: "free" },
  { seat: seat(3, "A3", 7, 2), state: "selected" },
  { seat: seat(4, "A4", 9, 2), state: "mine", occupants: [{ name: "Me" }] },
  { seat: seat(5, "B1", 4, 5), state: "free" },
];

const renderPlan = (props: Partial<Parameters<typeof SeatFloorPlan>[0]> = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <SeatFloorPlan
        room={room}
        seats={tiles()}
        label="Main Hall floor plan"
        onSeatSelect={vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe("seat labels", () => {
  it("describes each state", () => {
    const [taken, free, selected, mine] = tiles();
    expect(seatAriaLabel(taken)).toBe("A1, Front row, taken by NoScope_Nia");
    expect(seatAriaLabel(free)).toBe("A2, free");
    expect(seatAriaLabel(selected)).toBe("A3, selected");
    expect(seatAriaLabel(mine)).toBe("A4, your seat");
    expect(
      seatAriaLabel({ ...free, occupants: [{ name: "A" }, { name: null }] }),
    ).toBe("A2, free, shared with A and No callsign yet at other times");
  });

  it("puts identifier, description and occupants in the tooltip", () => {
    const [taken, free] = tiles();
    expect(seatTitle(taken)).toBe("A1 · Front row · NoScope_Nia");
    expect(seatTitle(free)).toBe("A2");
  });

  it("reads a seat's name after its identifier, and leads the tooltip with it", () => {
    const [, free] = tiles();
    const named = {
      ...free,
      seat: { ...free.seat, label: "S1", name: "Wall sofa (S)" },
    };
    expect(seatAriaLabel(named, true)).toBe(
      "S1, Wall sofa (S), with screen, free",
    );
    expect(seatTitle(named)).toBe("Wall sofa (S) · S1");
    // A name that only repeats the identifier isn't read twice.
    const same = { ...free, seat: { ...free.seat, name: " a2 " } };
    expect(seatAriaLabel(same)).toBe("A2, free");
    expect(seatTitle(same)).toBe("a2");
  });

  it("picks the tile's second line", () => {
    const [taken, free, selected, mine] = tiles();
    expect(seatSubLabel(taken)).toBe("NoScope_Nia");
    expect(
      seatSubLabel({
        ...taken,
        occupants: [{ name: "X" }, { name: "Y" }, { name: "Z" }],
      }),
    ).toBe("X +2");
    expect(seatSubLabel(free)).toBe("FREE");
    expect(seatSubLabel({ ...free, occupants: [{ name: "X" }] })).toBe(
      "SHARED",
    );
    expect(seatSubLabel(selected)).toBe("SELECTED");
    expect(seatSubLabel(mine)).toBe("YOU");
  });
});

describe("SeatFloorPlan", () => {
  it("renders a labelled group of seat buttons in reading order", () => {
    renderPlan();
    const group = screen.getByRole("group", { name: "Main Hall floor plan" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "A1, Front row, taken by NoScope_Nia",
      "A2, free",
      "A3, selected",
      "A4, your seat",
      "B1, free",
    ]);
    expect(within(group).getByText("Screen")).toBeInTheDocument();
    expect(within(group).getByText("Entrance")).toBeInTheDocument();
  });

  it("keeps long legacy labels inside their square, full text in the title", () => {
    const [, free] = tiles();
    renderPlan({
      seats: [
        {
          ...free,
          seat: {
            ...free.seat,
            label: "Window seat 12",
            description: "By the window",
          },
        },
      ],
    });
    const tile = screen.getByRole("button", {
      name: "Window seat 12, By the window, free",
    });
    expect(tile).toHaveAttribute("title", "Window seat 12 · By the window");
    const label = within(tile).getByText("Window seat 12");
    expect(label).toHaveStyle({
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(tile).toHaveStyle({ overflow: "hidden", minWidth: "0" });
  });

  it("disables taken seats and exposes the selection with aria-pressed", () => {
    renderPlan();
    expect(screen.getByRole("button", { name: /^A1, .*taken/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "A2, free" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "A3, selected" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "A4, your seat" }),
    ).not.toHaveAttribute("aria-pressed");
  });

  it("selects with click, Enter and Space", async () => {
    const onSeatSelect = vi.fn();
    const user = userEvent.setup();
    renderPlan({ onSeatSelect });

    await user.click(screen.getByRole("button", { name: "A2, free" }));
    expect(onSeatSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 2 }),
    );

    screen.getByRole("button", { name: "B1, free" }).focus();
    await user.keyboard("{Enter}");
    expect(onSeatSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 5 }),
    );

    screen.getByRole("button", { name: "A3, selected" }).focus();
    await user.keyboard(" ");
    expect(onSeatSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 3 }),
    );
  });

  it("never selects a taken seat", async () => {
    const onSeatSelect = vi.fn();
    renderPlan({ onSeatSelect });
    await userEvent.click(screen.getByRole("button", { name: /^A1, .*taken/ }));
    expect(onSeatSelect).not.toHaveBeenCalled();
  });

  it("moves focus to the nearest seat with the arrow keys, skipping taken ones", async () => {
    const user = userEvent.setup();
    renderPlan();
    screen.getByRole("button", { name: "A2, free" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "A3, selected" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "A4, your seat" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    // A1 is taken (disabled), so focus stays on A2.
    expect(screen.getByRole("button", { name: "A2, free" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "B1, free" })).toHaveFocus();
  });

  it("draws the background plan as a decorative image", () => {
    const { container } = renderPlan();
    const img = container.querySelector('img[src="/api/room-backgrounds/abc"]');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveStyle({ opacity: "0.5" });
  });

  it("backs every seat with an opaque fill so labels stay readable over the plan", () => {
    renderPlan({ onSeatSelect: undefined });
    for (const name of [/^A1, .*taken/, "A2, free", "A3, selected", /A4/]) {
      const tile = screen.getByRole("button", { name });
      const bg = getComputedStyle(tile).backgroundColor;
      // An opaque colour (not rgba(..., <1) / transparent).
      expect(bg).toMatch(/^(rgb\(|#)/);
      expect(tile).not.toHaveStyle({ opacity: "0.7" });
    }
  });

  it("is read-only without onSeatSelect", async () => {
    renderPlan({ onSeatSelect: undefined, selectable: false });
    const free = screen.getByRole("button", { name: "A2, free" });
    expect(free).not.toHaveAttribute("aria-pressed");
  });
});

describe("screens and entrances", () => {
  const plan = (features: FloorPlanRoom["features"], seats: SeatTile[] = []) =>
    render(
      <ThemeProvider theme={theme}>
        <SeatFloorPlan
          room={{ ...room, features, backgroundUrl: null }}
          seats={seats}
          label="Plan"
          onSeatSelect={vi.fn()}
        />
      </ThemeProvider>,
    );
  const squares = (container: HTMLElement, kind: string) =>
    container.querySelectorAll(`[data-feature="${kind}"]`);
  it("draws a legacy run as one shape and saved neighbours as separate ones", () => {
    const { container } = plan([
      { col: 0, row: 0, kind: "screen" },
      { col: 1, row: 0, kind: "screen" },
      { col: 4, row: 0, kind: "screen", group: 0 },
      { col: 5, row: 0, kind: "screen", group: 1 },
    ]);
    expect(squares(container, "screen")).toHaveLength(4);
    // One label per shape: the legacy pair, then two single screens.
    expect(container.querySelectorAll("[data-feature-label]")).toHaveLength(3);
  });

  it("shows icon and text on 2+ squares, the icon alone on one", () => {
    const { container } = plan([
      { col: 0, row: 3, kind: "entrance", group: 0 },
      { col: 0, row: 4, kind: "entrance", group: 0 },
      { col: 1, row: 4, kind: "entrance", group: 0 },
      { col: 6, row: 0, kind: "screen", group: 1 },
    ]);
    const [door, single] = [
      ...container.querySelectorAll("[data-feature-label]"),
    ].sort((a, b) =>
      (a.getAttribute("data-feature-label") ?? "").localeCompare(
        b.getAttribute("data-feature-label") ?? "",
      ),
    ) as HTMLElement[];
    expect(door.querySelector("svg")).not.toBeNull();
    expect(door).toHaveTextContent("Entrance");
    expect(single.querySelector("svg")).not.toBeNull();
    // The single square's name is for screen readers only.
    expect(within(single).getByText("Screen")).toHaveStyle({
      position: "absolute",
      width: "1px",
    });
  });

  it("shows a linked screen as free, taken or yours with its seat", () => {
    const features = [
      // A2 (4,2) has a two-square screen above it, linked by a side.
      { col: 4, row: 1, kind: "screen", group: 0, linkCol: 4, linkRow: 2 },
      { col: 5, row: 1, kind: "screen", group: 0, linkCol: 4, linkRow: 2 },
      // A1 (2,2): a screen at its top-left corner.
      { col: 1, row: 1, kind: "screen", group: 1, linkCol: 2, linkRow: 2 },
      // A4 (9,2): yours.
      { col: 10, row: 3, kind: "screen", group: 2, linkCol: 9, linkRow: 2 },
      // Not linked.
      { col: 0, row: 6, kind: "screen", group: 3 },
    ];
    const { container } = plan(features, tiles());
    const look = (col: number, row: number) =>
      container
        .querySelector(`[data-square="${col},${row}"]`)
        ?.getAttribute("data-look");
    expect(look(4, 1)).toBe("free");
    expect(look(5, 1)).toBe("free");
    expect(look(1, 1)).toBe("taken");
    expect(look(10, 3)).toBe("mine");
    expect(look(0, 6)).toBe("plain");
    // The linked seats say so; screens add no tab stops.
    expect(
      screen.getByRole("button", { name: "A2, with screen, free" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "A1, Front row, with screen, taken by NoScope_Nia",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "A4, with screen, your seat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "B1, free" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("ignores a link to a cell without a seat", () => {
    const { container } = plan(
      [{ col: 0, row: 0, kind: "screen", group: 0, linkCol: 1, linkRow: 1 }],
      tiles(),
    );
    expect(
      container.querySelector("[data-feature]")?.getAttribute("data-look"),
    ).toBe("plain");
  });
});

describe("FloorPlanLegend", () => {
  it("lists each state as text", () => {
    render(
      <FloorPlanLegend
        items={["mine", "free", { key: "taken", label: "Occupied" }]}
      />,
    );
    const list = screen.getByRole("list", { name: "Legend" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Your seat", "Free", "Occupied"]);
  });

  it("has a linked-screen entry", () => {
    render(<FloorPlanLegend items={["linkedScreen"]} />);
    expect(screen.getByRole("listitem").textContent).toBe(
      "Screen: same colour as its seat",
    );
  });
});
