import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ContextType } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RoomEditor from "../components/RoomEditor";
import { UserContext, UserDispatchContext } from "../UserProvider";
import type { ApiLayout, LayoutSubmit } from "../components/RoomEditor/layout";

const user = {
  token: "t",
  email: "admin@example.com",
  loggedIn: true,
  isAdmin: true,
};

const dispatch: ContextType<typeof UserDispatchContext> = {
  signIn: vi.fn(() => Promise.resolve({} as Response)),
  verifyEmail: vi.fn(() => Promise.resolve({} as Response)),
  signOut: vi.fn(),
  isSignedIn: vi.fn(() => true),
};

const layout = (): ApiLayout => ({
  rooms: [
    {
      id: 1,
      eventId: 7,
      name: "Main Hall",
      description: "Two rows",
      image: null,
      sortOrder: 0,
      gridRows: 4,
      features: [{ col: 3, row: 0, kind: "screen" }],
      backgroundUrl: null,
      backgroundStyle: "retro",
      backgroundOpacity: 0.6,
      seats: [
        {
          id: 10,
          label: "A1",
          description: null,
          gridCol: 2,
          gridRow: 2,
          x: 0,
          y: 0,
          reservedBy: {
            email: "nia@example.com",
            handle: "NoScope_Nia",
            avatarUrl: "",
          },
        },
      ],
    },
  ],
});

let puts: LayoutSubmit[] = [];

beforeEach(() => {
  puts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/events/7?"))
        return new Response(JSON.stringify({ id: 7, title: "Autumn LAN" }));
      if (url.startsWith("/api/events/7/room-layout")) {
        if (init?.method === "PUT") {
          const body = JSON.parse(init.body as string) as LayoutSubmit;
          puts.push(body);
          const l = layout();
          l.rooms[0].seats = body.rooms[0].seats.map((s, i) => ({
            ...s,
            id: s.id ?? 100 + i,
            description: null,
            x: 0,
            y: 0,
            reservedBy: s.id === 10 ? l.rooms[0].seats[0].reservedBy : null,
          }));
          l.rooms[0].features = body.rooms[0].features;
          return new Response(JSON.stringify(l));
        }
        return new Response(JSON.stringify(layout()));
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderEditor = () =>
  render(
    <MemoryRouter initialEntries={["/admin/events/7/rooms"]}>
      <UserContext.Provider value={user}>
        <UserDispatchContext.Provider value={dispatch}>
          <Routes>
            <Route path="/admin/events/:id/rooms" element={<RoomEditor />} />
            <Route path="/admin/events/:id" element={<p>Event page</p>} />
          </Routes>
        </UserDispatchContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>,
  );

const cell = (name: RegExp) => screen.getByRole("gridcell", { name });

describe("RoomEditor", { timeout: 20000 }, () => {
  it("renders the room tabs, toolbar and grid from the layout", async () => {
    renderEditor();
    const tab = await screen.findByRole("tab", { name: /Main Hall/ });
    expect(tab.textContent).toBe("Main Hall, 1 seat");
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Room editor",
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(48);
    expect(cell(/Seat A1, reserved by NoScope_Nia/)).toBeInTheDocument();
    expect(cell(/^Screen, column 4, row 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await screen.findByText(/Autumn LAN · Seating/i),
    ).toBeInTheDocument();
  });

  it("drops auto-labelled seats with the keyboard and saves the layout", async () => {
    renderEditor();
    const grid = await screen.findByRole("grid");
    const first = within(grid).getByRole("gridcell", {
      name: "Empty square, column 1, row 1",
    });
    // Switch tool with the shortcut, move right and down, drop a seat.
    fireEvent.keyDown(first, { key: "d" });
    expect(screen.getByRole("button", { name: "Seat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const below = cell(/Empty square, column 1, row 2/);
    await waitFor(() => expect(below).toHaveFocus());
    fireEvent.keyDown(below, { key: "Enter" });
    expect(cell(/^Seat B1, column 1, row 2/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    expect(
      await screen.findByText("Saved · seat map updated"),
    ).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(puts[0].releaseReserved).toBe(false);
    expect(puts[0].rooms[0].seats).toEqual([
      { label: "B1", name: null, description: null, gridCol: 0, gridRow: 1 },
      {
        id: 10,
        label: "A1",
        name: null,
        description: null,
        gridCol: 2,
        gridRow: 2,
      },
    ]);
  });

  it("confirms before removing a reserved seat and then releases it on save", async () => {
    renderEditor();
    const reserved = await screen.findByRole("gridcell", { name: /Seat A1/ });
    fireEvent.click(reserved);
    fireEvent.click(screen.getByRole("button", { name: "Remove seat" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "NoScope_Nia will lose their seat and will need to pick another",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove anyway" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("gridcell", { name: /Seat A1/ })).toBeNull(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save rooms" }));
    await screen.findByText("Saved · seat map updated");
    expect(puts[0].releaseReserved).toBe(true);
    expect(puts[0].rooms[0].seats).toEqual([]);
  });

  it("warns about duplicate labels and blocks saving", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Seat" }));
    fireEvent.click(cell(/Empty square, column 6, row 3/));
    const label = screen.getByLabelText("Identifier");
    // Sanitised as typed; identifiers clash regardless of case.
    fireEvent.change(label, { target: { value: "a1 !" } });
    expect(label).toHaveValue("a1");
    expect(label).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(
        "Another seat in this room already uses that identifier.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "more than one seat is labelled A1",
    );
    expect(puts).toHaveLength(0);
  });

  it("rejects unsupported background files before uploading", async () => {
    renderEditor();
    const input = await screen.findByLabelText("Upload floor plan or photo");
    const svg = new File(["<svg/>"], "plan.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [svg] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /PNG, JPEG, WebP or GIF/,
    );
  });

  it("asks before leaving with unsaved changes", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Add room" }));
    expect(screen.getByRole("tab", { name: /New room 2/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Seating/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Leave without saving?");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Discard changes" }),
    );
    expect(await screen.findByText("Event page")).toBeInTheDocument();
  });

  it("asks to release reserved seats on a 409 and retries with releaseReserved", async () => {
    const base = globalThis.fetch;
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (
          url.startsWith("/api/events/7/room-layout") &&
          init?.method === "PUT"
        ) {
          attempt++;
          const body = JSON.parse(init.body as string) as LayoutSubmit;
          if (!body.releaseReserved) {
            puts.push(body);
            return new Response(
              JSON.stringify({
                error: {
                  code: 409,
                  reason: "Conflict",
                  description: "Seat A1 was reserved by NoScope_Nia meanwhile.",
                },
              }),
              { status: 409 },
            );
          }
        }
        return base(url, init);
      }),
    );
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Seat" }));
    fireEvent.click(cell(/Empty square, column 6, row 3/));
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Seat A1 was reserved by NoScope_Nia meanwhile.",
    );
    expect(puts[0].releaseReserved).toBe(false);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save anyway" }),
    );
    expect(
      await screen.findByText("Saved · seat map updated"),
    ).toBeInTheDocument();
    expect(attempt).toBe(2);
    expect(puts).toHaveLength(2);
    expect(puts[1].releaseReserved).toBe(true);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("uploads a picked background after the layout save", async () => {
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    const base = globalThis.fetch;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") calls.push(url.split("?")[0]);
        if (url.startsWith("/api/events/7/rooms/1/background")) {
          const l = layout();
          return new Response(
            JSON.stringify({ ...l.rooms[0], backgroundUrl: "/bg/1.png" }),
          );
        }
        return base(url, init);
      }),
    );
    renderEditor();
    const input = await screen.findByLabelText("Upload floor plan or photo");
    const png = new File([new Uint8Array([137, 80, 78, 71])], "plan.png", {
      type: "image/png",
    });
    fireEvent.change(input, { target: { files: [png] } });
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    expect(
      await screen.findByText("Saved · seat map updated"),
    ).toBeInTheDocument();
    expect(calls).toEqual([
      "/api/events/7/room-layout",
      "/api/events/7/rooms/1/background",
    ]);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("locks editing while a save is in flight", async () => {
    const base = globalThis.fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (
          url.startsWith("/api/events/7/room-layout") &&
          init?.method === "PUT"
        )
          await gate;
        return base(url, init);
      }),
    );
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Seat" }));
    fireEvent.click(cell(/Empty square, column 6, row 3/));
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    await waitFor(() =>
      expect(screen.getByTestId("room-editor-body")).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    // An edit attempted mid-save is ignored rather than lost silently.
    fireEvent.click(cell(/Empty square, column 1, row 4/));
    expect(cell(/Empty square, column 1, row 4/)).toBeInTheDocument();
    release();
    expect(
      await screen.findByText("Saved · seat map updated"),
    ).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(screen.getByTestId("room-editor-body")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });
  it("moves a reserved seat with the keyboard (M, arrows, Enter) and saves it", async () => {
    renderEditor();
    const tile = await screen.findByRole("gridcell", { name: /^Seat A1/ });
    fireEvent.keyDown(tile, { key: "m" });
    await screen.findByText(/^Picked up seat A1\./);
    fireEvent.keyDown(tile, { key: "ArrowRight" });
    const target = cell(/Empty square, column 4, row 3/);
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute("data-drop", "ok");
    expect(tile).toHaveAttribute("data-drop", "source");
    await screen.findByText("column 4, row 3, free.");
    fireEvent.keyDown(target, { key: "ArrowRight" });
    const next = cell(/Empty square, column 5, row 3/);
    await waitFor(() => expect(next).toHaveFocus());
    fireEvent.keyDown(next, { key: "Enter" });
    const moved = cell(/^Seat A1, reserved by NoScope_Nia, column 5, row 3/);
    expect(moved).toHaveAttribute("aria-selected", "true");
    expect(cell(/Empty square, column 3, row 3/)).toBeInTheDocument();
    await screen.findByText(
      "Moved seat A1 to column 5, row 3. NoScope_Nia's reservation moves with it.",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    expect(
      await screen.findByText("Saved · seat map updated"),
    ).toBeInTheDocument();
    // Same seat id (so the reservation stays) and nothing released.
    expect(puts[0].releaseReserved).toBe(false);
    expect(puts[0].rooms[0].seats).toEqual([
      {
        id: 10,
        label: "A1",
        name: null,
        description: null,
        gridCol: 4,
        gridRow: 2,
      },
    ]);
    expect(
      cell(/^Seat A1, reserved by NoScope_Nia, column 5, row 3/),
    ).toBeInTheDocument();
  });

  it("cancels a keyboard move with Escape", async () => {
    renderEditor();
    const tile = await screen.findByRole("gridcell", { name: /^Seat A1/ });
    fireEvent.keyDown(tile, { key: "M" });
    fireEvent.keyDown(tile, { key: "ArrowUp" });
    const up = cell(/Empty square, column 3, row 2/);
    await waitFor(() => expect(up).toHaveFocus());
    fireEvent.keyDown(up, { key: "Escape" });
    await screen.findByText("Move cancelled. The seat A1 stays put.");
    expect(cell(/^Seat A1, .*column 3, row 3/)).toBeInTheDocument();
    expect(up).not.toHaveAttribute("data-drop");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  describe("pointer drag", () => {
    let hit: Element | null = null;
    beforeEach(() => {
      hit = null;
      // jsdom has no layout: point the drag at a chosen cell.
      document.elementFromPoint = vi.fn(() => hit);
    });

    const press = (el: Element, x = 10, pointerType = "mouse") =>
      fireEvent.pointerDown(el, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: 10,
        pointerType,
      });
    const moveTo = (target: Element, x: number) => {
      hit = target;
      fireEvent.pointerMove(target, { pointerId: 1, clientX: x, clientY: 10 });
    };

    it("drags a seat to an empty square, with a cyan drop preview", async () => {
      renderEditor();
      const tile = await screen.findByRole("gridcell", { name: /^Seat A1/ });
      const target = cell(/Empty square, column 8, row 4/);
      press(tile);
      // Under the 4px threshold it is still a click, not a drag.
      moveTo(target, 12);
      expect(target).not.toHaveAttribute("data-drop");
      moveTo(target, 40);
      expect(target).toHaveAttribute("data-drop", "ok");
      fireEvent.pointerUp(target, { pointerId: 1, clientX: 40, clientY: 10 });
      fireEvent.click(target);
      expect(
        cell(/^Seat A1, reserved by NoScope_Nia, column 8, row 4/),
      ).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("previews an occupied square in pink and refuses the drop", async () => {
      renderEditor();
      const tile = await screen.findByRole("gridcell", { name: /^Seat A1/ });
      const screenCell = cell(/^Screen, column 4, row 1/);
      press(tile);
      moveTo(screenCell, 60);
      expect(screenCell).toHaveAttribute("data-drop", "bad");
      fireEvent.pointerUp(screenCell, { pointerId: 1 });
      await screen.findByText(
        "Can't move it there. The screen is in the way. Seats can only swap places with other seats.",
      );
      expect(cell(/^Seat A1, .*column 3, row 3/)).toBeInTheDocument();
      expect(screen.queryByText("Unsaved changes")).toBeNull();
    });

    it("a plain click still selects (no drag)", async () => {
      renderEditor();
      const tile = await screen.findByRole("gridcell", { name: /^Seat A1/ });
      press(tile);
      fireEvent.pointerUp(tile, { pointerId: 1 });
      fireEvent.click(tile);
      expect(tile).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Identifier")).toHaveValue("A1");
    });

    it("on touch with Select, only a long press starts a drag", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderEditor();
        const tile = await screen.findByRole("gridcell", { name: /^Seat A1/ });
        const target = cell(/Empty square, column 1, row 1/);
        // A quick swipe is a scroll: nothing is picked up.
        press(tile, 10, "touch");
        moveTo(target, 60);
        expect(target).not.toHaveAttribute("data-drop");
        fireEvent.pointerUp(target, { pointerId: 1 });
        // Press and hold, then drag.
        press(tile, 10, "touch");
        vi.advanceTimersByTime(400);
        moveTo(target, 60);
        expect(target).toHaveAttribute("data-drop", "ok");
        fireEvent.pointerUp(target, { pointerId: 1 });
        expect(cell(/^Seat A1, .*column 1, row 1/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("moves a whole screen with the Move tool (tap, then tap)", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Move" }));
    expect(screen.getByRole("button", { name: "Move" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(cell(/^Screen, column 4, row 1/));
    await screen.findByText(/^Picked up screen\./);
    fireEvent.click(cell(/Empty square, column 9, row 2/));
    expect(cell(/^Screen, column 9, row 2/)).toBeInTheDocument();
    expect(cell(/Empty square, column 4, row 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    await screen.findByText("Saved · seat map updated");
    expect(puts[0].rooms[0].features).toEqual([
      { col: 8, row: 1, kind: "screen", group: 0 },
    ]);
  });

  it("edits a seat's description with a counter and saves it trimmed", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("gridcell", { name: /^Seat A1/ }));
    const about = screen.getByLabelText("Description (optional)");
    fireEvent.change(about, {
      target: { value: "  Window seat next to the fridge " },
    });
    expect(screen.getByText(/^33\/120/)).toBeInTheDocument();
    expect(
      cell(/^Seat A1, Window seat next to the fridge, reserved by NoScope_Nia/),
    ).toHaveAttribute(
      "title",
      "A1 · Window seat next to the fridge · Reserved by NoScope_Nia",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    await screen.findByText("Saved · seat map updated");
    expect(puts[0].rooms[0].seats[0].description).toBe(
      "Window seat next to the fridge",
    );
  });

  describe("seat names and legacy labels", () => {
    /** Serve a layout whose room also has seats with old-editor labels. */
    const withLegacySeats = () => {
      const base = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (
            url.startsWith("/api/events/7/room-layout") &&
            init?.method !== "PUT"
          ) {
            const l = layout();
            l.rooms[0].seats.push(
              {
                id: 11,
                label: "WALL SOFA (S)",
                description: "By the TV",
                gridCol: 0,
                gridRow: 3,
                x: 0,
                y: 0,
                reservedBy: null,
              },
              {
                id: 12,
                label: "WINDOW SEAT 12",
                name: null,
                description: null,
                gridCol: 5,
                gridRow: 3,
                x: 0,
                y: 0,
                reservedBy: null,
              },
            );
            return new Response(JSON.stringify(l));
          }
          return base(url, init);
        }),
      );
    };

    it("names a seat with a counter and saves the name trimmed", async () => {
      renderEditor();
      fireEvent.click(
        await screen.findByRole("gridcell", { name: /^Seat A1/ }),
      );
      const name = screen.getByLabelText("Name (optional)");
      expect(
        screen.getByText(
          "Shown instead of the identifier wherever the seat is mentioned.",
        ),
      ).toBeInTheDocument();
      fireEvent.change(name, { target: { value: "  Wall sofa (S) " } });
      expect(screen.getByText(/^16\/60/)).toBeInTheDocument();
      expect(
        cell(/^Seat A1, Wall sofa \(S\), reserved by NoScope_Nia/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
      await screen.findByText("Saved · seat map updated");
      expect(puts[0].rooms[0].seats[0]).toMatchObject({
        id: 10,
        label: "A1",
        name: "Wall sofa (S)",
      });
    });

    it("converts all legacy labels from the banner and saves names with identifiers", async () => {
      withLegacySeats();
      renderEditor();
      const banner = await screen.findByTestId("legacy-labels-banner");
      expect(banner).toHaveTextContent(
        "2 seats have labels too long to be identifiers (e.g. WALL SOFA (S)).",
      );
      // Nothing is converted until asked.
      expect(cell(/^Seat WALL SOFA \(S\)/)).toBeInTheDocument();
      fireEvent.click(
        within(banner).getByRole("button", { name: "Convert all to names" }),
      );
      expect(
        screen.queryByTestId("legacy-labels-banner"),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByText(
            "Converted 2 seat labels to names with short identifiers.",
          ),
        ).toBeInTheDocument(),
      );
      expect(cell(/^Seat WS, WALL SOFA \(S\), By the TV/)).toBeInTheDocument();
      expect(cell(/^Seat WS12, WINDOW SEAT 12/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
      await screen.findByText("Saved · seat map updated");
      expect(puts[0].rooms[0].seats).toEqual([
        {
          id: 10,
          label: "A1",
          name: null,
          description: null,
          gridCol: 2,
          gridRow: 2,
        },
        {
          id: 11,
          label: "WS",
          name: "WALL SOFA (S)",
          description: "By the TV",
          gridCol: 0,
          gridRow: 3,
        },
        {
          id: 12,
          label: "WS12",
          name: "WINDOW SEAT 12",
          description: null,
          gridCol: 5,
          gridRow: 3,
        },
      ]);
    });

    it("converts one seat with 'Use as name', and saves unconverted ones unchanged", async () => {
      withLegacySeats();
      renderEditor();
      fireEvent.click(
        await screen.findByRole("gridcell", { name: /^Seat WINDOW SEAT 12/ }),
      );
      const note = screen.getByTestId("legacy-label-note");
      fireEvent.click(
        within(note).getByRole("button", { name: "Use as name" }),
      );
      expect(screen.getByLabelText("Identifier")).toHaveValue("WS12");
      expect(screen.getByLabelText("Name (optional)")).toHaveValue(
        "WINDOW SEAT 12",
      );
      expect(screen.queryByTestId("legacy-label-note")).not.toBeInTheDocument();
      expect(screen.getByTestId("legacy-labels-banner")).toHaveTextContent(
        "1 seat has a label too long to be an identifier (WALL SOFA (S)).",
      );
      fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
      await screen.findByText("Saved · seat map updated");
      const seats = puts[0].rooms[0].seats;
      expect(seats.find((s) => s.id === 11)).toMatchObject({
        label: "WALL SOFA (S)",
        name: null,
      });
      expect(seats.find((s) => s.id === 12)).toMatchObject({
        label: "WS12",
        name: "WINDOW SEAT 12",
      });
    });
  });

  describe("screens and entrances", () => {
    /** Serve a layout with these features (A1 sits at column 3, row 3). */
    const withFeatures = (features: ApiLayout["rooms"][0]["features"]) => {
      const base = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (
            url.startsWith("/api/events/7/room-layout") &&
            init?.method !== "PUT"
          ) {
            const l = layout();
            l.rooms[0].features = features;
            return new Response(JSON.stringify(l));
          }
          return base(url, init);
        }),
      );
    };

    it("merges two separate screens with the Merge tool and saves one group", async () => {
      withFeatures([
        { col: 5, row: 0, kind: "screen", group: 0 },
        { col: 6, row: 0, kind: "screen", group: 1 },
      ]);
      renderEditor();
      await screen.findByRole("gridcell", { name: /^Screen, column 6, row 1/ });
      // Two touching squares, still two screens.
      expect(cell(/^Screen, column 7, row 1/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));
      fireEvent.click(cell(/^Screen, column 6, row 1/));
      expect(cell(/^Screen, column 7, row 1/)).toHaveAttribute(
        "data-candidate",
        "merge",
      );
      fireEvent.click(cell(/^Screen, column 7, row 1/));
      await screen.findByText("Merged into one screen (2 squares).");
      expect(cell(/^Screen, 2 squares, column 6, row 1/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
      await screen.findByText("Saved · seat map updated");
      expect(puts[0].rooms[0].features).toEqual([
        { col: 5, row: 0, kind: "screen", group: 0 },
        { col: 6, row: 0, kind: "screen", group: 0 },
      ]);
    });

    it("merges an L-shaped door with the keyboard and splits it again", async () => {
      withFeatures([
        { col: 0, row: 2, kind: "entrance", group: 0 },
        { col: 0, row: 3, kind: "entrance", group: 1 },
        { col: 1, row: 3, kind: "entrance", group: 2 },
      ]);
      renderEditor();
      const top = await screen.findByRole("gridcell", {
        name: /^Entrance, column 1, row 3/,
      });
      fireEvent.keyDown(top, { key: "g" });
      expect(screen.getByRole("button", { name: "Merge" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      fireEvent.keyDown(top, { key: "Enter" });
      fireEvent.keyDown(cell(/^Entrance, column 1, row 4/), { key: "Enter" });
      fireEvent.keyDown(cell(/^Entrance, column 2, row 4/), { key: "Enter" });
      await screen.findByText("Merged into one entrance (3 squares).");
      expect(cell(/^Entrance, 3 squares, column 2, row 4/)).toBeInTheDocument();
      // The side panel offers to split it.
      fireEvent.click(
        screen.getByRole("button", { name: "Split into single squares" }),
      );
      await screen.findByText("Split into 3 single-square entrances.");
      expect(cell(/^Entrance, column 1, row 4/)).toBeInTheDocument();
      // ...and to merge it back in one go.
      fireEvent.click(
        screen.getByRole("button", {
          name: "Merge with adjacent squares of the same type",
        }),
      );
      expect(cell(/^Entrance, 3 squares, column 1, row 3/)).toBeInTheDocument();
      // The Split tool detaches the corner square.
      fireEvent.click(screen.getByRole("button", { name: "Split" }));
      fireEvent.click(cell(/^Entrance, 3 squares, column 1, row 4/));
      await screen.findByText(
        /^Split off the square at column 1, row 4\. The rest is now 2 separate entrances\./,
      );
    });

    it("merges by dragging across squares", async () => {
      withFeatures([
        { col: 5, row: 0, kind: "screen", group: 0 },
        { col: 6, row: 0, kind: "screen", group: 1 },
        { col: 7, row: 0, kind: "screen", group: 2 },
      ]);
      let hit: Element | null = null;
      document.elementFromPoint = vi.fn(() => hit);
      renderEditor();
      const first = await screen.findByRole("gridcell", {
        name: /^Screen, column 6, row 1/,
      });
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));
      fireEvent.pointerDown(first, {
        pointerId: 3,
        isPrimary: true,
        button: 0,
        pointerType: "touch",
      });
      for (const col of [7, 8]) {
        hit = cell(new RegExp(`^Screen, column ${col}, row 1`));
        fireEvent.pointerMove(hit, { pointerId: 3 });
      }
      fireEvent.pointerUp(hit!, { pointerId: 3 });
      await screen.findByText("Merged into one screen (3 squares).");
    });

    it("links a screen to a neighbouring seat and saves the link", async () => {
      // A screen at A1's top-left corner, and one far away.
      withFeatures([
        { col: 1, row: 1, kind: "screen", group: 0 },
        { col: 9, row: 0, kind: "screen", group: 1 },
      ]);
      renderEditor();
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Screen, column 2, row 2/,
        }),
      );
      const select = screen.getByLabelText("Linked seat");
      expect(
        within(select)
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["None", "A1"]);
      fireEvent.change(select, { target: { value: "2,2" } });
      await screen.findByText(/^Screen linked to seat A1\./);
      expect(
        cell(/^Screen, linked to seat A1, column 2, row 2/),
      ).toBeInTheDocument();
      expect(
        cell(/^Seat A1, with screen, reserved by NoScope_Nia/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
      await screen.findByText("Saved · seat map updated");
      // Groups are renumbered in reading order on save.
      expect(puts[0].rooms[0].features).toEqual([
        { col: 9, row: 0, kind: "screen", group: 0 },
        { col: 1, row: 1, kind: "screen", group: 1, linkCol: 2, linkRow: 2 },
      ]);
      // The far screen has nothing to link to.
      fireEvent.click(cell(/^Screen, column 10, row 1/));
      expect(screen.getByLabelText("Linked seat")).toBeDisabled();
    });

    it("picks the seat on the grid with the keyboard, and clears the link when the seat moves away", async () => {
      withFeatures([{ col: 3, row: 2, kind: "screen", group: 0 }]);
      renderEditor();
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Screen, column 4, row 3/,
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Pick the seat on the grid" }),
      );
      await screen.findByText(/^Pick the seat for this screen: A1\./);
      const seat = cell(/^Seat A1, .*can be linked/);
      expect(seat).toHaveAttribute("data-candidate", "link");
      await waitFor(() => expect(seat).toHaveFocus());
      fireEvent.keyDown(seat, { key: "Enter" });
      await screen.findByText(/^Screen linked to seat A1\./);
      // Move A1 far away: the link goes, with a note.
      const linked = cell(/^Seat A1, with screen/);
      fireEvent.keyDown(linked, { key: "m" });
      fireEvent.keyDown(linked, { key: "Home" });
      const target = cell(/Empty square, column 1, row 3/);
      await waitFor(() => expect(target).toHaveFocus());
      fireEvent.keyDown(target, { key: "Enter" });
      expect(await screen.findByTestId("link-note")).toHaveTextContent(
        "The screen at column 4, row 3 no longer touches seat A1, so its link was cleared.",
      );
      expect(cell(/^Screen, column 4, row 3/)).toBeInTheDocument();
    });

    it("cancels picking a seat with Escape", async () => {
      withFeatures([{ col: 3, row: 2, kind: "screen", group: 0 }]);
      renderEditor();
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Screen, column 4, row 3/,
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Pick the seat on the grid" }),
      );
      const seat = cell(/^Seat A1, .*can be linked/);
      await waitFor(() => expect(seat).toHaveFocus());
      fireEvent.keyDown(seat, { key: "Escape" });
      await screen.findByText("Linking cancelled.");
      expect(cell(/^Seat A1, reserved/)).not.toHaveAttribute("data-candidate");
    });

    it("does not carry seat picking over when the room is deleted", async () => {
      withFeatures([{ col: 3, row: 2, kind: "screen", group: 0 }]);
      renderEditor();
      // A new room with a screen at the same square as Main Hall's, and a
      // seat beside it to link to.
      fireEvent.click(await screen.findByRole("button", { name: "Add room" }));
      fireEvent.click(screen.getByRole("button", { name: "Screen" }));
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Empty square, column 4, row 3/,
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Seat" }));
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Empty square, column 5, row 3/,
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Select" }));
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Screen, column 4, row 3/,
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Pick the seat on the grid" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Delete room" }));
      // The confirm dialog repeats the label; its button is the second one.
      const confirmDelete = await screen.findAllByRole("button", {
        name: "Delete room",
      });
      fireEvent.click(confirmDelete[confirmDelete.length - 1]);
      // Main Hall takes over: its screen at the same square is not mid-pick.
      fireEvent.click(
        await screen.findByRole("gridcell", {
          name: /^Screen, column 4, row 3/,
        }),
      );
      expect(
        screen.queryByRole("button", { name: "Cancel picking a seat" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Pick the seat on the grid" }),
      ).toBeInTheDocument();
    });

    it("shows a merged shape's label and an icon-only single square", async () => {
      withFeatures([
        { col: 5, row: 0, kind: "screen", group: 0 },
        { col: 6, row: 0, kind: "screen", group: 0 },
        { col: 9, row: 0, kind: "entrance", group: 1 },
      ]);
      const { container } = renderEditor();
      await screen.findAllByRole("gridcell", { name: /^Screen, 2 squares/ });
      const labels = container.querySelectorAll("[data-shape-label]");
      expect(labels).toHaveLength(1);
      expect(labels[0]).toHaveTextContent("Screen");
      expect(labels[0].querySelector("svg")).not.toBeNull();
      expect(
        cell(/^Entrance, column 10, row 1/).querySelector("svg"),
      ).not.toBeNull();
    });
  });
});
