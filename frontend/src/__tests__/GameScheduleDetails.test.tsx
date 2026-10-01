import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GameScheduleDetails from "../components/GameScheduleDetails";
import { GameScheduleEntry } from "../types/game_schedule";
import { GameSuggestion, GameVote } from "../types/game_suggestions";
import { InvitationLiteData, RSVP } from "../types/invitations";
import moment from "moment";

const mockScheduleEntry: GameScheduleEntry = {
  id: 1,
  eventId: 1,
  gameId: 100,
  gameName: "Test Game",
  startTime: moment(),
  durationMinutes: 60,
  isPinned: false,
  isSuggested: false,
  createdAt: moment(),
  lastModified: moment(),
};

const gamer = (handle: string) => ({ handle, avatarUrl: null });

describe("GameScheduleDetails", () => {
  it("renders Unpin button when isAdmin is true and game is pinned", () => {
    const onUnpin = vi.fn();
    const pinnedEntry = { ...mockScheduleEntry, isPinned: true };

    render(
      <GameScheduleDetails
        scheduleEntry={pinnedEntry}
        onClose={() => {}}
        isAdmin={true}
        onUnpin={onUnpin}
      />,
    );

    const unpinButton = screen.getByRole("button", { name: "Unpin" });
    expect(unpinButton).toBeInTheDocument();

    fireEvent.click(unpinButton);
    expect(onUnpin).toHaveBeenCalled();
  });

  it("does not render Unpin button when game is not pinned", () => {
    const onUnpin = vi.fn();
    const onPin = vi.fn();
    const unpinnedEntry = { ...mockScheduleEntry, isPinned: false };

    render(
      <GameScheduleDetails
        scheduleEntry={unpinnedEntry}
        onClose={() => {}}
        isAdmin={true}
        onUnpin={onUnpin}
        onPin={onPin}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Unpin" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    expect(onPin).toHaveBeenCalled();
    // Suggested slots cannot be removed, only pinned.
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
  });

  it("does not render Unpin button when not admin", () => {
    const onUnpin = vi.fn();
    const pinnedEntry = { ...mockScheduleEntry, isPinned: true };

    render(
      <GameScheduleDetails
        scheduleEntry={pinnedEntry}
        onClose={() => {}}
        isAdmin={false}
        onUnpin={onUnpin}
        onRemove={vi.fn()}
        timing={{
          days: [{ label: "FRI", active: true, onPick: vi.fn() }],
          start: "19:00",
          end: "20:00",
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Unpin" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Timing/i)).not.toBeInTheDocument();
  });

  it("shows status, rank, owners, voters and who is around", () => {
    const suggestion: GameSuggestion = {
      appid: 100,
      name: "Test Game",
      userEmail: "a@b.c",
      comment: "Bring headsets",
      lastModified: moment(),
      requestedAt: moment(),
      suggestionLastModified: moment(),
      selfVote: GameVote.noVote,
      votes: 2,
      voters: [gamer("Ann"), gamer("Bob")],
      suggester: gamer("Ann"),
      gamerOwned: [gamer("Ann")],
      gamerUnowned: [gamer("Bob")],
      gamerUnknown: [],
    };
    const invite = (
      handle: string,
      attendance: number[],
    ): InvitationLiteData => ({
      eventId: 1,
      avatarUrl: null,
      handle,
      response: RSVP.yes,
      attendance,
      seatId: null,
      lastModified: moment(),
    });
    render(
      <GameScheduleDetails
        scheduleEntry={{
          ...mockScheduleEntry,
          isPinned: true,
          startTime: moment.utc("2026-11-14T14:00:00Z"),
        }}
        suggestion={suggestion}
        invitations={[
          invite("Ann", [1, 1, 1, 1, 1, 1, 1, 1]),
          invite("Bob", [1, 1, 1, 0, 1, 1, 1, 1]),
        ]}
        eventStart="2026-11-13T18:00:00Z"
        eventEnd="2026-11-15T12:00:00Z"
        onClose={() => {}}
        rank={1}
        whenLabel="SAT 14 NOV · 14:00 → 15:00"
      />,
    );
    expect(screen.getByText("PINNED")).toBeInTheDocument();
    expect(screen.getByTestId("session-when")).toHaveTextContent(
      "SAT 14 NOV · 14:00 → 15:00",
    );
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    expect(screen.getByText("“Bring headsets”")).toBeInTheDocument();
    const owns = screen.getByRole("list", { name: "owns" });
    expect(within(owns).getByText("Ann")).toBeInTheDocument();
    const needs = screen.getByRole("list", { name: "needs it" });
    expect(within(needs).getByText("Bob")).toBeInTheDocument();
    const away = screen.getByRole("list", { name: "not there" });
    expect(within(away).getByText("Bob")).toBeInTheDocument();
  });

  it("wires the admin timing controls and the off-window note", () => {
    const onPick = vi.fn();
    const onStartEarlier = vi.fn();
    const onEndLater = vi.fn();
    const onClose = vi.fn();
    render(
      <GameScheduleDetails
        scheduleEntry={{ ...mockScheduleEntry, isPinned: true }}
        onClose={onClose}
        isAdmin
        onRemove={vi.fn()}
        outsideWindow
        timing={{
          days: [
            { label: "FRI", active: true, onPick: vi.fn() },
            { label: "SAT", active: false, onPick },
          ],
          start: "19:00",
          end: "20:00",
          onStartEarlier,
          onEndLater,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "FRI" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "SAT" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Start 30 minutes earlier" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "End 30 minutes later" }),
    );
    expect(onPick).toHaveBeenCalled();
    expect(onStartEarlier).toHaveBeenCalled();
    expect(onEndLater).toHaveBeenCalled();
    // No handler = step disabled.
    expect(
      screen.getByRole("button", { name: "Start 30 minutes later" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Outside the auto-schedule window/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(onClose).toHaveBeenCalled();
  });
});
