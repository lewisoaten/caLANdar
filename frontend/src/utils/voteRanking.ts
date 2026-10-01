/**
 * The one place game-vote ranks and trophies are worked out. The lobby vote
 * list, the Games page and the schedule (timeline, day cards, details drawer,
 * add dialog) all use it so they always agree.
 *
 * Rules:
 * - Only games with at least one vote are ranked; zero-vote games get no rank
 *   and never a trophy.
 * - Dense ranking by vote count: votes 5,5,4,4,3,1 rank 1,1,2,2,3,4.
 * - Dense ranks 1/2/3 earn gold/silver/bronze, so joint-first, joint-second
 *   and joint-third games all share their trophy.
 */

export type TrophyRank = 1 | 2 | 3;

export interface VoteRank {
  /** Dense rank among games with votes (ties share it), or null at 0 votes. */
  rank: number | null;
  /** 1-3 (gold/silver/bronze) when the game earns a trophy, else null. */
  trophyRank: TrophyRank | null;
  votes: number;
}

export interface RankedSuggestion<T> extends VoteRank {
  suggestion: T;
}

/** The trophy a dense rank earns (1-3), else null. */
export const trophyForRank = (
  rank: number | null | undefined,
): TrophyRank | null => (rank === 1 || rank === 2 || rank === 3 ? rank : null);

/** `#2`, or an em dash for an unranked (no votes) game. */
export const formatRank = (rank: number | null | undefined): string =>
  rank != null && rank > 0 ? `#${rank}` : "—";

const byVotesThenName = <T extends { votes: number | null; name: string }>(
  a: T,
  b: T,
) =>
  (b.votes ?? 0) - (a.votes ?? 0) ||
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * Suggestions ordered by votes (most first, ties by name) with their dense
 * rank and trophy. Pure; the input is not modified. A null vote count counts
 * as zero.
 */
export function rankByVotes<T extends { votes: number | null; name: string }>(
  suggestions: readonly T[],
): RankedSuggestion<T>[] {
  const sorted = [...suggestions].sort(byVotesThenName);
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((suggestion) => {
    const votes = suggestion.votes ?? 0;
    if (votes <= 0)
      return { suggestion, votes: 0, rank: null, trophyRank: null };
    if (votes !== prev) {
      rank += 1;
      prev = votes;
    }
    return { suggestion, votes, rank, trophyRank: trophyForRank(rank) };
  });
}

/** Each game's vote rank keyed by Steam appid. */
export function voteRankMap<
  T extends { appid: number; votes: number | null; name: string },
>(suggestions: readonly T[]): Map<number, VoteRank> {
  return new Map(
    rankByVotes(suggestions).map(({ suggestion, rank, trophyRank, votes }) => [
      suggestion.appid,
      { rank, trophyRank, votes },
    ]),
  );
}
