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
    const label = screen.getByLabelText("Label");
    fireEvent.change(label, { target: { value: "a-1" } });
    expect(label).toHaveValue("A1");
    expect(label).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Another desk in this room already uses that label."),
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
});
