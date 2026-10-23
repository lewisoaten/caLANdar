import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialLiveState, type LiveState } from "../live/store";
import type { PersonView } from "../live/types";
import { hereSummary } from "../live/selectors";
import { HereStrip, TV_MAX_SHOWN } from "../components/live/HereStrip";

const person = (pid: string, extra: Partial<PersonView> = {}): PersonView => ({
  pid,
  handle: pid,
  avatarUrl: "",
  seat: null,
  rsvp: "yes",
  attendance: [],
  checkedIn: true,
  checkedInAt: null,
  awayUntil: null,
  departed: false,
  staying: false,
  hasSteam: false,
  presence: null,
  ...extra,
});

const stateOf = (...people: PersonView[]): LiveState => ({
  ...initialLiveState(1),
  people: Object.fromEntries(people.map((p) => [p.pid, p])),
});

const state = stateOf(
  person("zed", { hasSteam: true }),
  person("amy"),
  person("bob", { hasSteam: true }),
  person("cat", { checkedIn: false, hasSteam: true }),
  person("dan", { checkedIn: false, rsvp: "maybe" }),
  person("eve", { checkedIn: false, rsvp: "no" }),
);

describe("who's here", () => {
  test("lists the checked-in, Steam-linked first", () => {
    const s = hereSummary(state);
    expect(s.here.map((p) => p.pid)).toEqual(["bob", "zed", "amy"]);
    expect(s.steam).toBe(2);
    expect(s.attending).toBe(5);
  });

  test("shows the counts and highlights Steam-linked people", () => {
    render(<HereStrip state={state} />);
    expect(screen.getByText("HERE 3/5")).toBeTruthy();
    expect(screen.getByText("2 ON STEAM")).toBeTruthy();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-steam"))).toEqual([
      "true",
      "true",
      "false",
    ]);
  });

  test("says when nobody is here", () => {
    render(<HereStrip state={stateOf(person("amy", { checkedIn: false }))} />);
    expect(screen.getByText("NOBODY CHECKED IN YET")).toBeTruthy();
  });

  test("on the wall-board it caps the avatars", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      person(`p${String(i).padStart(2, "0")}`, { hasSteam: i % 2 === 0 }),
    );
    render(<HereStrip state={stateOf(...many)} tv />);
    expect(screen.getByText("HERE 20/20")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(TV_MAX_SHOWN + 1);
    expect(screen.getByText("+6")).toBeTruthy();
  });
});
