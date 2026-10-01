import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import InvitationSeatManagementTable from "../components/InvitationSeatManagementTable";
import { renderAsAdmin } from "./adminTestUtils";

const STAMP = "2026-10-05T19:30:00Z";
const event = {
  id: 7,
  title: "Autumn LAN",
  description: "",
  image: undefined,
  timeBegin: moment("2026-11-13T18:00:00Z"),
  timeEnd: moment("2026-11-15T12:00:00Z"),
  createdAt: moment(STAMP),
  lastModified: moment(STAMP),
};

const invitation = (email: string, handle: string, attendance: number[]) => ({
  eventId: 7,
  email,
  avatarUrl: null,
  handle,
  invitedAt: STAMP,
  respondedAt: STAMP,
  response: "yes",
  attendance,
  lastModified: STAMP,
});

const reservation = (id: number, seatId: number | null, email: string) => ({
  id,
  eventId: 7,
  seatId,
  invitationEmail: email,
  attendanceBuckets: [1, 1, 1, 1],
  createdAt: STAMP,
  lastModified: STAMP,
});

const server = setupServer(
  http.get("/api/events/7/invitations", () =>
    HttpResponse.json([
      invitation("nia@example.com", "Nia", [1, 1, 1, 1, 1, 1, 1, 0]),
      invitation("dan@example.com", "Dan", [0, 0, 1, 1, 1, 0, 0, 0]),
      invitation("kai@example.com", "Kai", [0, 0, 1, 1, 0, 0, 0, 0]),
    ]),
  ),
  http.get("/api/events/7/seat-reservations", () =>
    HttpResponse.json([
      reservation(1, 701, "nia@example.com"),
      reservation(2, null, "dan@example.com"),
    ]),
  ),
  http.get("/api/events/7/rooms", () =>
    HttpResponse.json([
      {
        id: 70,
        eventId: 7,
        name: "Main Hall",
        description: null,
        image: null,
        sortOrder: 0,
        createdAt: STAMP,
        lastModified: STAMP,
      },
    ]),
  ),
  http.get("/api/events/7/seats", () =>
    HttpResponse.json([
      {
        id: 701,
        eventId: 7,
        roomId: 70,
        label: "A2",
        description: null,
        x: 0.2,
        y: 0.2,
        createdAt: STAMP,
        lastModified: STAMP,
      },
    ]),
  ),
  http.get("/api/events/7/seating-config", () =>
    HttpResponse.json({
      eventId: 7,
      hasSeating: true,
      allowUnspecifiedSeat: true,
      unspecifiedSeatLabel: "Floating / no desk",
      createdAt: STAMP,
      lastModified: STAMP,
    }),
  ),
  http.get("/api/events", () =>
    HttpResponse.json({ events: [], total: 0, page: 1, totalPages: 1 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const row = async (handle: string) => {
  const list = await screen.findByRole("list", { name: "Invitees" });
  const item = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText(handle));
  if (!item) throw new Error(`No row for ${handle}`);
  return item;
};

describe("InvitationSeatManagementTable", () => {
  test("names seats, the event's floating label, and 'no seat yet'", async () => {
    renderAsAdmin(<InvitationSeatManagementTable event={event} as_admin />);
    expect(await row("Nia")).toHaveTextContent("Seat A2, Main Hall");
    const dan = await row("Dan");
    expect(dan).toHaveTextContent("Seat: Floating / no desk");
    expect(dan).not.toHaveTextContent(/unspecified/i);
    expect(await row("Kai")).toHaveTextContent("No seat yet");
  });

  test("attendance strips and timestamps are not tab stops", async () => {
    renderAsAdmin(<InvitationSeatManagementTable event={event} as_admin />);
    const nia = await row("Nia");
    const strip = within(nia).getByRole("img", { name: /friday|saturday/i });
    expect(strip).not.toHaveAttribute("tabindex");
    expect(strip.getAttribute("aria-label")).not.toMatch(/bucket/i);
    const time = nia.querySelector("time");
    expect(time).not.toBeNull();
    expect(time).not.toHaveAttribute("tabindex");
    expect(time).toHaveTextContent(/Last updated/);
    // Only real controls are focusable within the row.
    for (const el of nia.querySelectorAll<HTMLElement>("[tabindex]")) {
      expect(el.matches("button, a, input, [role=button]")).toBe(true);
    }
  });

  test("invalid email is explained inline, not by a native bubble", async () => {
    const user = userEvent.setup();
    renderAsAdmin(<InvitationSeatManagementTable event={event} as_admin />);
    await row("Nia");
    const input = screen.getByRole("textbox", { name: "Invite by email" });
    expect(input.closest("form")).toHaveAttribute("novalidate");
    await user.type(input, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "not-an-email isn't a valid email address.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });

  test("shows the server's reason for each email that wasn't sent", async () => {
    let posts = 0;
    server.use(
      http.post("/api/events/7/invitations", async ({ request }) => {
        posts += 1;
        const { email } = (await request.json()) as { email: string };
        if (email === "nia@example.com")
          return HttpResponse.json(
            {
              error: {
                code: 409,
                reason: "Conflict",
                description: "nia@example.com is already invited to this event",
              },
            },
            { status: 409 },
          );
        return HttpResponse.json(
          invitation(email, "", [0, 0, 0, 0, 0, 0, 0, 0]),
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderAsAdmin(<InvitationSeatManagementTable event={event} as_admin />);
    await row("Nia");
    const input = screen.getByRole("textbox", { name: "Invite by email" });
    await user.type(input, "nia@example.com, new@example.com");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    const alert = await screen.findByText(
      "nia@example.com is already invited to this event.",
    );
    expect(alert).toHaveAttribute("role", "alert");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(posts).toBe(2);
    // Only the failed address stays in the field.
    expect(input).toHaveValue("nia@example.com");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("a 502 keeps the saved invite out of the field but explains it", async () => {
    server.use(
      http.post("/api/events/7/invitations", () =>
        HttpResponse.json(
          {
            error: {
              code: 502,
              reason: "Bad Gateway",
              description:
                "Invitation for new@example.com was saved but the email could not be sent; use resend to try again",
            },
          },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAsAdmin(<InvitationSeatManagementTable event={event} as_admin />);
    await row("Nia");
    const input = screen.getByRole("textbox", { name: "Invite by email" });
    await user.type(input, "new@example.com");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(
      await screen.findByText(
        "Invitation for new@example.com was saved but the email could not be sent; use resend to try again.",
      ),
    ).toHaveAttribute("role", "alert");
    expect(input).toHaveValue("");
  });
});
