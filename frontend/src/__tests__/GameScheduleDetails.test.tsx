import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GameScheduleDetails from "../components/GameScheduleDetails";
import { GameScheduleEntry } from "../types/game_schedule";
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

    const unpinButton = screen.getByText("Unpin Game");
    expect(unpinButton).toBeInTheDocument();

    fireEvent.click(unpinButton);
    expect(onUnpin).toHaveBeenCalled();
  });

  it("does not render Unpin button when game is not pinned", () => {
    const onUnpin = vi.fn();
    const unpinnedEntry = { ...mockScheduleEntry, isPinned: false };

    render(
      <GameScheduleDetails
        scheduleEntry={unpinnedEntry}
        onClose={() => {}}
        isAdmin={true}
        onUnpin={onUnpin}
      />,
    );

    expect(screen.queryByText("Unpin Game")).not.toBeInTheDocument();
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
      />,
    );

    expect(screen.queryByText("Unpin Game")).not.toBeInTheDocument();
  });
});
