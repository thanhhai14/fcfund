export const OUTFIELD_STARTERS_PER_TEAM = 4;
export const MINIMUM_SHARED_GOALKEEPERS = 2;

export function plannedGoalkeeperCount(teamCount: number, goalkeeperCandidates: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2) return 0;
  return Math.min(teamCount, Math.max(0, Math.trunc(goalkeeperCandidates)));
}

export function minimumParticipantsForTeams(teamCount: number, goalkeeperCandidates: number) {
  return teamCount * OUTFIELD_STARTERS_PER_TEAM + plannedGoalkeeperCount(teamCount, goalkeeperCandidates);
}

export function plannedTeamSizes(memberCount: number, teamCount: number, goalkeeperCandidates: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2) return [];
  const goalkeeperCount = plannedGoalkeeperCount(teamCount, goalkeeperCandidates);
  const sizes = Array.from({ length: teamCount }, (_, index) => OUTFIELD_STARTERS_PER_TEAM + Number(index < goalkeeperCount));
  let remaining = memberCount - sizes.reduce((sum, size) => sum + size, 0);
  while (remaining > 0) {
    const smallest = Math.min(...sizes);
    const index = sizes.findIndex((size) => size === smallest);
    sizes[index] += 1;
    remaining -= 1;
  }
  return sizes.sort((first, second) => second - first);
}
