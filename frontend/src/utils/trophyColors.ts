/**
 * Get trophy color based on rank
 * @param rank - The rank (1, 2, 3) or null/undefined
 * @returns Hex color code for the trophy, or empty string if no rank
 */
export const getTrophyColor = (rank: number | null | undefined): string => {
  const colors: Record<number, string> = {
    1: "#FFD700", // Gold
    2: "#C0C0C0", // Silver
    3: "#CD7F32", // Bronze
  };
  return rank ? colors[rank] || "" : "";
};
