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
    expect(tab.textContent).toBe("Main Hall, 1 desk");
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Room editor",
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(48);
    expect(cell(/Desk A1, reserved by NoScope_Nia/)).toBeInTheDocument();
    expect(cell(/^Screen, column 4, row 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await screen.findByText(/Autumn LAN · Seating/i),
    ).toBeInTheDocument();
  });

  it("drops auto-labelled desks with the keyboard and saves the layout", async () => {
    renderEditor();
    const grid = await screen.findByRole("grid");
    const first = within(grid).getByRole("gridcell", {
      name: "Empty square, column 1, row 1",
    });
    // Switch tool with the shortcut, move right and down, drop a desk.
    fireEvent.keyDown(first, { key: "d" });
    expect(screen.getByRole("button", { name: "Desk" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const below = cell(/Empty square, column 1, row 2/);
    await waitFor(() => expect(below).toHaveFocus());
    fireEvent.keyDown(below, { key: "Enter" });
    expect(cell(/^Desk B1, column 1, row 2/)).toHaveAttribute(
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
      { label: "B1", description: null, gridCol: 0, gridRow: 1 },
      { id: 10, label: "A1", description: null, gridCol: 2, gridRow: 2 },
    ]);
  });

  it("confirms before removing a reserved desk and then releases it on save", async () => {
    renderEditor();
    const reserved = await screen.findByRole("gridcell", { name: /Desk A1/ });
    fireEvent.click(reserved);
    fireEvent.click(screen.getByRole("button", { name: "Remove desk" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "NoScope_Nia will lose their seat and will need to pick another",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove anyway" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("gridcell", { name: /Desk A1/ })).toBeNull(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save rooms" }));
    await screen.findByText("Saved · seat map updated");
    expect(puts[0].releaseReserved).toBe(true);
    expect(puts[0].rooms[0].seats).toEqual([]);
  });

  it("warns about duplicate labels and blocks saving", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Desk" }));
    fireEvent.click(cell(/Empty square, column 6, row 3/));
    const label = screen.getByLabelText("Identifier");
    // Sanitised as typed; identifiers clash regardless of case.
    fireEvent.change(label, { target: { value: "a1 !" } });
    expect(label).toHaveValue("a1");
    expect(label).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(
        "Another desk in this room already uses that identifier.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "more than one desk is labelled A1",
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

  it("asks to release reserved desks on a 409 and retries with releaseReserved", async () => {
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
                  description: "Desk A1 was reserved by NoScope_Nia meanwhile.",
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
    fireEvent.click(await screen.findByRole("button", { name: "Desk" }));
    fireEvent.click(cell(/Empty square, column 6, row 3/));
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Desk A1 was reserved by NoScope_Nia meanwhile.",
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
    fireEvent.click(await screen.findByRole("button", { name: "Desk" }));
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
  it("moves a reserved desk with the keyboard (M, arrows, Enter) and saves it", async () => {
    renderEditor();
    const desk = await screen.findByRole("gridcell", { name: /^Desk A1/ });
    fireEvent.keyDown(desk, { key: "m" });
    await screen.findByText(/^Picked up desk A1\./);
    fireEvent.keyDown(desk, { key: "ArrowRight" });
    const target = cell(/Empty square, column 4, row 3/);
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute("data-drop", "ok");
    expect(desk).toHaveAttribute("data-drop", "source");
    await screen.findByText("column 4, row 3, free.");
    fireEvent.keyDown(target, { key: "ArrowRight" });
    const next = cell(/Empty square, column 5, row 3/);
    await waitFor(() => expect(next).toHaveFocus());
    fireEvent.keyDown(next, { key: "Enter" });
    const moved = cell(/^Desk A1, reserved by NoScope_Nia, column 5, row 3/);
    expect(moved).toHaveAttribute("aria-selected", "true");
    expect(cell(/Empty square, column 3, row 3/)).toBeInTheDocument();
    await screen.findByText(
      "Moved desk A1 to column 5, row 3. NoScope_Nia's reservation moves with it.",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    expect(
      await screen.findByText("Saved · seat map updated"),
    ).toBeInTheDocument();
    // Same seat id (so the reservation stays) and nothing released.
    expect(puts[0].releaseReserved).toBe(false);
    expect(puts[0].rooms[0].seats).toEqual([
      { id: 10, label: "A1", description: null, gridCol: 4, gridRow: 2 },
    ]);
    expect(
      cell(/^Desk A1, reserved by NoScope_Nia, column 5, row 3/),
    ).toBeInTheDocument();
  });

  it("cancels a keyboard move with Escape", async () => {
    renderEditor();
    const desk = await screen.findByRole("gridcell", { name: /^Desk A1/ });
    fireEvent.keyDown(desk, { key: "M" });
    fireEvent.keyDown(desk, { key: "ArrowUp" });
    const up = cell(/Empty square, column 3, row 2/);
    await waitFor(() => expect(up).toHaveFocus());
    fireEvent.keyDown(up, { key: "Escape" });
    await screen.findByText("Move cancelled. The desk A1 stays put.");
    expect(cell(/^Desk A1, .*column 3, row 3/)).toBeInTheDocument();
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

    it("drags a desk to an empty square, with a cyan drop preview", async () => {
      renderEditor();
      const desk = await screen.findByRole("gridcell", { name: /^Desk A1/ });
      const target = cell(/Empty square, column 8, row 4/);
      press(desk);
      // Under the 4px threshold it is still a click, not a drag.
      moveTo(target, 12);
      expect(target).not.toHaveAttribute("data-drop");
      moveTo(target, 40);
      expect(target).toHaveAttribute("data-drop", "ok");
      fireEvent.pointerUp(target, { pointerId: 1, clientX: 40, clientY: 10 });
      fireEvent.click(target);
      expect(
        cell(/^Desk A1, reserved by NoScope_Nia, column 8, row 4/),
      ).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("previews an occupied square in pink and refuses the drop", async () => {
      renderEditor();
      const desk = await screen.findByRole("gridcell", { name: /^Desk A1/ });
      const screenCell = cell(/^Screen, column 4, row 1/);
      press(desk);
      moveTo(screenCell, 60);
      expect(screenCell).toHaveAttribute("data-drop", "bad");
      fireEvent.pointerUp(screenCell, { pointerId: 1 });
      await screen.findByText(
        "Can't move it there. The screen is in the way. Desks can only swap places with other desks.",
      );
      expect(cell(/^Desk A1, .*column 3, row 3/)).toBeInTheDocument();
      expect(screen.queryByText("Unsaved changes")).toBeNull();
    });

    it("a plain click still selects (no drag)", async () => {
      renderEditor();
      const desk = await screen.findByRole("gridcell", { name: /^Desk A1/ });
      press(desk);
      fireEvent.pointerUp(desk, { pointerId: 1 });
      fireEvent.click(desk);
      expect(desk).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Identifier")).toHaveValue("A1");
    });

    it("on touch with Select, only a long press starts a drag", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderEditor();
        const desk = await screen.findByRole("gridcell", { name: /^Desk A1/ });
        const target = cell(/Empty square, column 1, row 1/);
        // A quick swipe is a scroll: nothing is picked up.
        press(desk, 10, "touch");
        moveTo(target, 60);
        expect(target).not.toHaveAttribute("data-drop");
        fireEvent.pointerUp(target, { pointerId: 1 });
        // Press and hold, then drag.
        press(desk, 10, "touch");
        vi.advanceTimersByTime(400);
        moveTo(target, 60);
        expect(target).toHaveAttribute("data-drop", "ok");
        fireEvent.pointerUp(target, { pointerId: 1 });
        expect(cell(/^Desk A1, .*column 1, row 1/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("moves a whole screen strip with the Move tool (tap, then tap)", async () => {
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
      { col: 8, row: 1, kind: "screen" },
    ]);
  });

  it("edits a desk's description with a counter and saves it trimmed", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("gridcell", { name: /^Desk A1/ }));
    const about = screen.getByLabelText("Description (optional)");
    fireEvent.change(about, {
      target: { value: "  Window desk next to the fridge " },
    });
    expect(screen.getByText(/^33\/120/)).toBeInTheDocument();
    expect(
      cell(/^Desk A1, Window desk next to the fridge, reserved by NoScope_Nia/),
    ).toHaveAttribute(
      "title",
      "A1 · Window desk next to the fridge · Reserved by NoScope_Nia",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }));
    await screen.findByText("Saved · seat map updated");
    expect(puts[0].rooms[0].seats[0].description).toBe(
      "Window desk next to the fridge",
    );
  });
});
