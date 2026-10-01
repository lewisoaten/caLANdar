import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";
import {
  SeatFloorPlan,
  FloorPlanLegend,
  deskAriaLabel,
  deskSubLabel,
  deskTitle,
  type FloorPlanDesk,
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

const desks = (): FloorPlanDesk[] => [
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
        desks={desks()}
        label="Main Hall floor plan"
        onDeskSelect={vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe("desk labels", () => {
  it("describes each state", () => {
    const [taken, free, selected, mine] = desks();
    expect(deskAriaLabel(taken)).toBe("A1, Front row, taken by NoScope_Nia");
    expect(deskAriaLabel(free)).toBe("A2, free");
    expect(deskAriaLabel(selected)).toBe("A3, selected");
    expect(deskAriaLabel(mine)).toBe("A4, your seat");
    expect(
      deskAriaLabel({ ...free, occupants: [{ name: "A" }, { name: null }] }),
    ).toBe("A2, free, shared with A and No callsign yet at other times");
  });

  it("puts identifier, description and occupants in the tooltip", () => {
    const [taken, free] = desks();
    expect(deskTitle(taken)).toBe("A1 · Front row · NoScope_Nia");
    expect(deskTitle(free)).toBe("A2");
  });

  it("picks the tile's second line", () => {
    const [taken, free, selected, mine] = desks();
    expect(deskSubLabel(taken)).toBe("NoScope_Nia");
    expect(
      deskSubLabel({
        ...taken,
        occupants: [{ name: "X" }, { name: "Y" }, { name: "Z" }],
      }),
    ).toBe("X +2");
    expect(deskSubLabel(free)).toBe("FREE");
    expect(deskSubLabel({ ...free, occupants: [{ name: "X" }] })).toBe(
      "SHARED",
    );
    expect(deskSubLabel(selected)).toBe("SELECTED");
    expect(deskSubLabel(mine)).toBe("YOU");
  });
});

describe("SeatFloorPlan", () => {
  it("renders a labelled group of desk buttons in reading order", () => {
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
    const [, free] = desks();
    renderPlan({
      desks: [
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
    const desk = screen.getByRole("button", {
      name: "Window seat 12, By the window, free",
    });
    expect(desk).toHaveAttribute("title", "Window seat 12 · By the window");
    const label = within(desk).getByText("Window seat 12");
    expect(label).toHaveStyle({
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(desk).toHaveStyle({ overflow: "hidden", minWidth: "0" });
  });

  it("disables taken desks and exposes the selection with aria-pressed", () => {
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
    const onDeskSelect = vi.fn();
    const user = userEvent.setup();
    renderPlan({ onDeskSelect });

    await user.click(screen.getByRole("button", { name: "A2, free" }));
    expect(onDeskSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 2 }),
    );

    screen.getByRole("button", { name: "B1, free" }).focus();
    await user.keyboard("{Enter}");
    expect(onDeskSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 5 }),
    );

    screen.getByRole("button", { name: "A3, selected" }).focus();
    await user.keyboard(" ");
    expect(onDeskSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 3 }),
    );
  });

  it("never selects a taken desk", async () => {
    const onDeskSelect = vi.fn();
    renderPlan({ onDeskSelect });
    await userEvent.click(screen.getByRole("button", { name: /^A1, .*taken/ }));
    expect(onDeskSelect).not.toHaveBeenCalled();
  });

  it("moves focus to the nearest desk with the arrow keys, skipping taken ones", async () => {
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

  it("backs every desk with an opaque fill so labels stay readable over the plan", () => {
    renderPlan({ onDeskSelect: undefined });
    for (const name of [/^A1, .*taken/, "A2, free", "A3, selected", /A4/]) {
      const desk = screen.getByRole("button", { name });
      const bg = getComputedStyle(desk).backgroundColor;
      // An opaque colour (not rgba(..., <1) / transparent).
      expect(bg).toMatch(/^(rgb\(|#)/);
      expect(desk).not.toHaveStyle({ opacity: "0.7" });
    }
  });

  it("is read-only without onDeskSelect", async () => {
    renderPlan({ onDeskSelect: undefined, selectable: false });
    const free = screen.getByRole("button", { name: "A2, free" });
    expect(free).not.toHaveAttribute("aria-pressed");
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
});
