import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { initialLiveState, type LiveState } from "../live/store";
import type { LiveEventInfo, PersonView } from "../live/types";
import { MeStrip } from "../components/live/MeStrip";

const NOW = Date.parse("2026-10-23T20:00:00Z");

const me = (extra: Partial<PersonView> = {}): PersonView => ({
  pid: "me",
  handle: "Ana",
  avatarUrl: "",
  seat: null,
  rsvp: "yes",
  attendance: [],
  checkedIn: true,
  checkedInAt: "2026-10-23T18:05:00Z",
  awayUntil: null,
  hasSteam: false,
  presence: null,
  ...extra,
});

const stateFor = (person: PersonView): LiveState => ({
  ...initialLiveState(1),
  me: "me",
  event: {
    timeBegin: "2026-10-23T18:00:00Z",
    timeEnd: "2026-10-25T16:00:00Z",
  } as LiveEventInfo,
  people: { me: person },
});

const strip = (person: PersonView) => {
  const onCheckIn = vi.fn();
  const onCheckOut = vi.fn();
  render(
    <MeStrip
      state={stateFor(person)}
      now={NOW}
      onCheckIn={onCheckIn}
      onCheckOut={onCheckOut}
      onSelect={() => {}}
    />,
  );
  return { onCheckIn, onCheckOut };
};

describe("MeStrip stepping out", () => {
  test("offers 30 minutes, 1 hour and 2 hours while checked in", () => {
    const { onCheckOut } = strip(me());
    fireEvent.click(screen.getByRole("button", { name: "Step out" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "For 30 minutes",
      "For 1 hour",
      "For 2 hours",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "For 1 hour" }));
    expect(onCheckOut).toHaveBeenCalledWith(60);
  });

  test("shows when you're due back, and I'm back checks in again", () => {
    const { onCheckIn } = strip(
      me({ checkedIn: false, awayUntil: "2026-10-23T21:00:00Z" }),
    );
    expect(screen.getByText(/STEPPED OUT · BACK/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Step out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "I'm here" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I'm back" }));
    expect(onCheckIn).toHaveBeenCalled();
  });

  test("can't step out before checking in", () => {
    strip(me({ checkedIn: false, checkedInAt: null }));
    expect(screen.queryByRole("button", { name: "Step out" })).toBeNull();
    expect(screen.getByRole("button", { name: "I'm here" })).toBeTruthy();
  });
});
