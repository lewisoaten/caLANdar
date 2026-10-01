import { describe, expect, test } from "vitest";
import {
  formatRank,
  rankByVotes,
  trophyForRank,
  voteRankMap,
} from "../utils/voteRanking";

const g = (name: string, votes: number | null) => ({ name, votes });
const summary = (games: ReturnType<typeof g>[]) =>
  rankByVotes(games).map((r) => [r.suggestion.name, r.rank, r.trophyRank]);

describe("rankByVotes", () => {
  test("dense ranks: 5,5,4,4,3,1 → gold, gold, silver, silver, bronze, none", () => {
    expect(
      summary([
        g("F", 1),
        g("A", 5),
        g("C", 4),
        g("B", 5),
        g("E", 3),
        g("D", 4),
      ]),
    ).toEqual([
      ["A", 1, 1],
      ["B", 1, 1],
      ["C", 2, 2],
      ["D", 2, 2],
      ["E", 3, 3],
      ["F", 4, null],
    ]);
  });

  test("zero and null votes are unranked and never earn a trophy", () => {
    expect(summary([g("Z", 0), g("A", 2), g("N", null)])).toEqual([
      ["A", 1, 1],
      ["N", null, null],
      ["Z", null, null],
    ]);
  });

  test("all games at zero: no ranks, no trophies", () => {
    expect(summary([g("A", 0), g("B", 0)])).toEqual([
      ["A", null, null],
      ["B", null, null],
    ]);
  });

  test("a single voted game takes gold", () => {
    expect(summary([g("Solo", 1)])).toEqual([["Solo", 1, 1]]);
  });

  test("a single unvoted game is unranked", () => {
    expect(summary([g("Solo", 0)])).toEqual([["Solo", null, null]]);
  });

  test("all tied: everyone shares gold", () => {
    expect(summary([g("C", 3), g("A", 3), g("B", 3)])).toEqual([
      ["A", 1, 1],
      ["B", 1, 1],
      ["C", 1, 1],
    ]);
  });

  test("gaps in vote counts don't skip ranks", () => {
    expect(summary([g("A", 10), g("B", 2), g("C", 1), g("D", 1)])).toEqual([
      ["A", 1, 1],
      ["B", 2, 2],
      ["C", 3, 3],
      ["D", 3, 3],
    ]);
  });

  test("more than three distinct counts: only the top three places", () => {
    expect(
      summary([g("A", 4), g("B", 3), g("C", 2), g("D", 1)]).map((r) => r[2]),
    ).toEqual([1, 2, 3, null]);
  });

  test("ties on votes sort by name, case-insensitively", () => {
    expect(
      rankByVotes([g("beta", 1), g("Alpha", 1)]).map((r) => r.suggestion.name),
    ).toEqual(["Alpha", "beta"]);
  });

  test("empty input and the input array is untouched", () => {
    expect(rankByVotes([])).toEqual([]);
    const input = [g("B", 1), g("A", 2)];
    rankByVotes(input);
    expect(input.map((x) => x.name)).toEqual(["B", "A"]);
  });

  test("re-ranks when a vote changes", () => {
    const games = [g("A", 2), g("B", 1)];
    expect(rankByVotes(games)[0].suggestion.name).toBe("A");
    games[1] = g("B", 3);
    expect(rankByVotes(games)[0].suggestion.name).toBe("B");
    games[0] = g("A", 3);
    expect(summary(games)).toEqual([
      ["A", 1, 1],
      ["B", 1, 1],
    ]);
  });
});

describe("voteRankMap", () => {
  test("keys by appid with rank, trophy and votes", () => {
    const map = voteRankMap([
      { appid: 1, name: "A", votes: 2 },
      { appid: 2, name: "B", votes: 2 },
      { appid: 3, name: "C", votes: 0 },
    ]);
    expect(map.get(1)).toEqual({ rank: 1, trophyRank: 1, votes: 2 });
    expect(map.get(2)).toEqual({ rank: 1, trophyRank: 1, votes: 2 });
    expect(map.get(3)).toEqual({ rank: null, trophyRank: null, votes: 0 });
  });
});

describe("trophyForRank / formatRank", () => {
  test("trophies for 1-3 only", () => {
    expect([1, 2, 3, 4, 0, null, undefined].map(trophyForRank)).toEqual([
      1,
      2,
      3,
      null,
      null,
      null,
      null,
    ]);
  });

  test("formats ranks and the unranked dash", () => {
    expect(formatRank(1)).toBe("#1");
    expect(formatRank(12)).toBe("#12");
    expect(formatRank(null)).toBe("—");
    expect(formatRank(undefined)).toBe("—");
  });
});
