import { describe, test, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "../test/test-utils";
import GamesList, {
  filterGames,
  formatPlayedHours,
  groupByOwners,
  ownedByLabel,
  resultsAnnouncement,
  voteRanks,
  type SquadGame,
} from "../components/GamesList";
import { isSameGamer, sortOwners } from "../components/GameOwners";
import {
  eventGamesUrl,
  fetchAllPages,
  suggestBlocker,
  withVotes,
} from "../components/EventGames";
import { RSVP } from "../types/invitations";
import moment from "moment";

const gamer = (handle: string, avatarUrl: string | null = null) => ({
  handle,
  avatarUrl,
});

const createMockGame = (
  appid: number,
  name: string,
  owners: string[] = [],
  vote: SquadGame["vote"] = null,
): SquadGame => ({
  appid,
  name,
  gamerOwned: owners.map((h) => gamer(h)),
  playtimeForever: 0,
  lastModified: moment(),
  vote,
});

const games: SquadGame[] = [
  createMockGame(1, "Game 1", ["a", "b", "c"], {
    rank: 1,
    votes: 4,
    trophyRank: 1,
  }),
  createMockGame(2, "Game 2", ["a", "b", "c"]),
  createMockGame(3, "Game 3", ["a"], {
    rank: 4,
    votes: 1,
    trophyRank: null,
  }),
];

describe("GamesList helpers", () => {
  test("formatPlayedHours", () => {
    expect(formatPlayedHours(0)).toBeNull();
    expect(formatPlayedHours(20)).toBe("<1 H PLAYED");
    expect(formatPlayedHours(98430)).toBe("1,641 H PLAYED");
  });

  test("voteRanks ranks like the lobby: dense shared ranks, no trophy at 0 votes", () => {
    const ranks = voteRanks([
      { appid: 10, name: "Beta", votes: 1 },
      { appid: 11, name: "Zed", votes: 5 },
      { appid: 12, name: "Alpha", votes: 1 },
      { appid: 13, name: "Gamma", votes: null },
    ]);
    expect(ranks.get(11)).toEqual({ rank: 1, votes: 5, trophyRank: 1 });
    // Ties share a rank and its trophy (dense ranking).
    expect(ranks.get(12)).toEqual({ rank: 2, votes: 1, trophyRank: 2 });
    expect(ranks.get(10)).toEqual({ rank: 2, votes: 1, trophyRank: 2 });
    // No vote: unranked, no trophy.
    expect(ranks.get(13)).toEqual({ rank: null, votes: 0, trophyRank: null });
  });

  test("resultsAnnouncement", () => {
    expect(resultsAnnouncement(3, 3, "")).toBe("3 games shown");
    expect(resultsAnnouncement(1, 3, "")).toBe("1 of 3 games shown");
    expect(resultsAnnouncement(1, 1, " val ")).toBe("1 game match “val”");
  });

  test("eventGamesUrl adds the search only when given", () => {
    expect(eventGamesUrl("2", 0)).toBe("/api/events/2/games?page=0&count=100");
    expect(eventGamesUrl("2", 1, " Half Life ")).toBe(
      "/api/events/2/games?page=1&count=100&search=Half+Life",
    );
  });

  test("fetchAllPages caps requests in flight and keeps page order", async () => {
    let inFlight = 0;
    let peak = 0;
    const requested: number[] = [];
    const page = (n: number) => ({
      totalCount: 6,
      eventGames: [createMockGame(n, `G${n}`)],
    });
    const fetchPage = async (n: number) => {
      requested.push(n);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n === 1 ? 20 : 5));
      inFlight--;
      return page(n);
    };
    const progress: boolean[] = [];
    const all = await fetchAllPages(fetchPage, {
      concurrency: 2,
      onProgress: (_, done) => progress.push(done),
    });
    expect(all.map((g) => g.appid)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(requested.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(progress.at(-1)).toBe(true);
    expect(progress.slice(0, -1).every((d) => !d)).toBe(true);
  });

  test("fetchAllPages stops when aborted", async () => {
    const controller = new AbortController();
    const requested: number[] = [];
    await fetchAllPages(
      async (n) => {
        requested.push(n);
        if (n === 1) controller.abort();
        return { totalCount: 10, eventGames: [] };
      },
      { concurrency: 1, signal: controller.signal },
    );
    expect(requested).toEqual([0, 1]);
  });

  test("filterGames applies search and vote filter", () => {
    expect(filterGames(games, "", "all")).toHaveLength(3);
    expect(filterGames(games, "", "in").map((g) => g.appid)).toEqual([1, 3]);
    expect(filterGames(games, "", "out").map((g) => g.appid)).toEqual([2]);
    expect(filterGames(games, " game 3 ", "all").map((g) => g.appid)).toEqual([
      3,
    ]);
  });

  test("groupByOwners groups most-owned first", () => {
    const groups = groupByOwners([games[2], games[0], games[1]]);
    expect(groups.map((g) => g.owners)).toEqual([3, 1]);
    expect(groups[0].games.map((g) => g.appid)).toEqual([1, 2]);
  });

  test("ownedByLabel", () => {
    expect(ownedByLabel(3, 6)).toBe("Owned by 3 of 6");
    expect(ownedByLabel(3, 0)).toBe("Owned by 3");
  });

  test("withVotes attaches rank info", () => {
    const out = withVotes(
      games,
      new Map([[2, { rank: 1, votes: 2, trophyRank: 1 as const }]]),
    );
    expect(out.find((g) => g.appid === 2)?.vote).toEqual({
      rank: 1,
      votes: 2,
      trophyRank: 1,
    });
    expect(out.find((g) => g.appid === 1)?.vote).toBeNull();
  });

  test("suggestBlocker", () => {
    const future = { id: 1, title: "LAN", timeEnd: Date.now() + 1e6 };
    const past = { id: 1, title: "LAN", timeEnd: Date.now() - 1e6 };
    const yes = { handle: "a", avatarUrl: null, response: RSVP.yes };
    const no = { handle: "a", avatarUrl: null, response: RSVP.no };
    expect(suggestBlocker(future, yes)).toBeUndefined();
    expect(suggestBlocker(future, no)).toMatch(/rsvp/i);
    expect(suggestBlocker(future, null)).toMatch(/rsvp/i);
    expect(suggestBlocker(past, yes)).toMatch(/closed/i);
  });

  test("isSameGamer prefers avatar URLs over handles", () => {
    expect(
      isSameGamer(gamer("x", "u1"), { avatarUrl: "u1", handle: "y" }),
    ).toBe(true);
    expect(
      isSameGamer(gamer("x", "u2"), { avatarUrl: "u1", handle: "x" }),
    ).toBe(false);
    expect(isSameGamer(gamer("x"), { handle: "x" })).toBe(true);
    expect(
      sortOwners([gamer("a"), gamer("me")], { handle: "me" })[0].handle,
    ).toBe("me");
  });
});

describe("GamesList", () => {
  test("groups games under 'Owned by N of M' headings", () => {
    render(<GamesList games={games} squadSize={6} loading={false} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Owned by 3 of 6" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Owned by 1 of 6" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Game 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Games" }),
    ).toBeInTheDocument();
  });

  test("shows vote rank for suggested games and a suggest button otherwise", async () => {
    const onSuggest = vi.fn();
    render(
      <GamesList
        games={games}
        squadSize={6}
        loading={false}
        lobbyHref="/events/1"
        onSuggest={onSuggest}
      />,
    );
    const card1 = screen.getByRole("article", { name: "Game 1" });
    expect(within(card1).getByText("IN THE VOTE · #1")).toBeInTheDocument();
    expect(
      within(card1).getByRole("img", { name: "1st place" }),
    ).toBeInTheDocument();
    expect(
      within(card1).getByRole("link", { name: "See Game 1 in the vote" }),
    ).toHaveAttribute("href", "/events/1");

    const card2 = screen.getByRole("article", { name: "Game 2" });
    await userEvent.click(
      within(card2).getByRole("button", { name: /suggest game 2/i }),
    );
    expect(onSuggest).toHaveBeenCalledWith(games[1]);
  });

  test("filters by vote status and search", async () => {
    render(<GamesList games={games} squadSize={6} loading={false} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Not suggested" }),
    );
    expect(
      screen.getByRole("button", { name: "Not suggested" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Game 1")).not.toBeInTheDocument();
    expect(screen.getByText("Game 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter games" }),
      "zzz",
    );
    expect(
      screen.getByText("No games match those filters."),
    ).toBeInTheDocument();
  });

  test("shows the reason when suggesting is unavailable", () => {
    render(
      <GamesList
        games={games}
        loading={false}
        suggestUnavailable="Suggestions closed"
      />,
    );
    expect(screen.getByText("Suggestions closed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /for this lan/i }),
    ).not.toBeInTheDocument();
  });

  test("trophy needs a vote", () => {
    render(
      <GamesList
        games={[
          createMockGame(9, "Zero", ["a"], {
            rank: null,
            votes: 0,
            trophyRank: null,
          }),
        ]}
        loading={false}
      />,
    );
    const card = screen.getByRole("article", { name: "Zero" });
    expect(within(card).getByText("IN THE VOTE · —")).toBeInTheDocument();
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
  });

  test("announces the result count in one live region once typing pauses", async () => {
    render(<GamesList games={games} squadSize={6} loading={false} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter games" }),
      "game 3",
    );
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent("1 game match");
    await waitFor(
      () => expect(status).toHaveTextContent("1 game match “game 3”"),
      { timeout: 2000 },
    );
  });

  test("server-side search: shows the given games as-is and reports typing", async () => {
    const onQueryChange = vi.fn();
    render(
      <GamesList
        games={[games[2]]}
        loading={false}
        query="zzz"
        onQueryChange={onQueryChange}
        searching
      />,
    );
    // Not filtered locally by the (server-side) query.
    expect(screen.getByText("Game 3")).toBeInTheDocument();
    expect(screen.getByText("SEARCHING…")).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter games" }),
      "a",
    );
    expect(onQueryChange).toHaveBeenCalledWith("zzza");
  });

  test("empty and error states", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<GamesList games={[]} loading={false} />);
    expect(screen.getByText("No games yet")).toBeInTheDocument();
    rerender(
      <GamesList games={[]} loading={false} error="Boom" onRetry={onRetry} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
