import { trophy } from "../components/hl/tokens";

/**
 * Get trophy color based on rank
 * @param rank - The rank (1, 2, 3) or null/undefined
 * @returns Hex color code for the trophy (HyperLAN gold/silver/bronze), or
 * empty string if the rank has no trophy
 */
export const getTrophyColor = (rank: number | null | undefined): string => {
  const colors: Record<number, string> = trophy;
  return rank != null && rank > 0 ? colors[rank] || "" : "";
};
