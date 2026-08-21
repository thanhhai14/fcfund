export type PlacementRankingEntry = {
  name: string;
  matchCount: number;
  placementCounts: number[];
};

export function comparePlacementRanking(first: PlacementRankingEntry, second: PlacementRankingEntry) {
  const firstHasMatches = first.matchCount > 0;
  const secondHasMatches = second.matchCount > 0;
  if (firstHasMatches !== secondHasMatches) return firstHasMatches ? -1 : 1;

  const firstPlaceDifference = (second.placementCounts[0] ?? 0) - (first.placementCounts[0] ?? 0);
  if (firstPlaceDifference) return firstPlaceDifference;

  if (first.matchCount !== second.matchCount) return first.matchCount - second.matchCount;

  const maxPlacement = Math.max(first.placementCounts.length, second.placementCounts.length);
  for (let index = 1; index < maxPlacement; index += 1) {
    const difference = (second.placementCounts[index] ?? 0) - (first.placementCounts[index] ?? 0);
    if (difference) return difference;
  }

  return first.name.localeCompare(second.name, "vi");
}
