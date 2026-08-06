import { generateBalancedTeams, type BalanceParticipant, type SeedTier } from "../src/lib/team-balancer";

function participants(count: number): BalanceParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `participant-${index}`,
    memberId: `member-${index}`,
    name: `Cầu thủ ${index + 1}`,
    seedTier: (index < Math.max(1, Math.floor(count / 8))
      ? "GOALKEEPER"
      : `TIER_${(index % 4) + 1}`) as SeedTier,
    recentMatchCount: 10,
    recentLossCount: index % 5,
    recentLossRate: (index % 5) * 1_500,
  }));
}

for (const [memberCount, teamCount] of [[10, 2], [16, 3], [20, 2], [30, 5]] as const) {
  const input = participants(memberCount);
  const first = generateBalancedTeams(input, teamCount, `test-${memberCount}-${teamCount}`);
  const repeated = generateBalancedTeams(input, teamCount, `test-${memberCount}-${teamCount}`);
  if (JSON.stringify(first) !== JSON.stringify(repeated)) throw new Error("Random key không tái hiện kết quả.");
  const sizes = first.teams.map((team) => team.memberCount);
  const goalkeepers = first.teams.map((team) => team.goalkeeperCount);
  if (sizes.reduce((sum, size) => sum + size, 0) !== memberCount) throw new Error("Thiếu người trong kết quả.");
  if (Math.min(...sizes) < 5 || Math.max(...sizes) - Math.min(...sizes) > 1) throw new Error("Quân số không hợp lệ.");
  if (Math.max(...goalkeepers) - Math.min(...goalkeepers) > 1) throw new Error("Thủ môn không được chia đều.");
}

console.log("Team balancer tests passed.");
