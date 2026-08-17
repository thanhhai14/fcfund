import { generateBalancedTeams, type BalanceParticipant, type SeedTier } from "../src/lib/team-balancer";
import { calculateAdjustedFormScore, placementFormScore } from "../src/lib/form-score";

if (placementFormScore(4, 1) !== 10_000) throw new Error("Hạng nhất phải nhận 100 điểm phong độ.");
if (placementFormScore(4, 2) !== 6_667) throw new Error("Hạng nhì trong bốn đội phải nhận 66,67 điểm.");
if (placementFormScore(4, 4) !== 0) throw new Error("Hạng chót phải nhận 0 điểm phong độ.");
if (calculateAdjustedFormScore([]).formScore !== 5_000) throw new Error("Người chưa có dữ liệu phải ở mức trung lập.");
if (calculateAdjustedFormScore([10_000]).formScore !== 6_250) throw new Error("Một trận thắng phải được làm mượt về 62,5 điểm.");
if (calculateAdjustedFormScore([0]).formScore !== 3_750) throw new Error("Một trận thua phải được làm mượt về 37,5 điểm.");
if (calculateAdjustedFormScore([10_000, 0]).formScore <= calculateAdjustedFormScore([0, 10_000]).formScore) {
  throw new Error("Kết quả mới hơn phải có trọng số lớn hơn.");
}

function participants(count: number): BalanceParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `participant-${index}`,
    memberId: `member-${index}`,
    name: `Cầu thủ ${index + 1}`,
    seedTier: `TIER_${(index % 7) + 1}` as SeedTier,
    goalkeeperAvailable: index < 5,
    recentMatchCount: 10,
    recentLossCount: index % 5,
    recentLossRate: (index % 5) * 1_500,
    formScore: 7_000 - (index % 5) * 900,
    formConfidence: 7_000,
    inferredMatchCount: 0,
    lowForm: index % 7 === 0,
    desiredPositions: index % 4 === 0 ? ["DEFENDER"] : index % 4 === 1 ? ["MIDFIELDER"] : index % 4 === 2 ? ["FORWARD"] : [],
    playerStrength: index % 2 === 0 ? "DEFENSE" : "ATTACK",
  }));
}

for (const [memberCount, teamCount] of [[10, 2], [11, 3], [18, 4], [19, 4], [20, 2], [30, 5]] as const) {
  const input = participants(memberCount);
  const first = generateBalancedTeams(input, teamCount, `test-${memberCount}-${teamCount}`);
  const repeated = generateBalancedTeams(input, teamCount, `test-${memberCount}-${teamCount}`);
  if (JSON.stringify(first) !== JSON.stringify(repeated)) throw new Error("Random key không tái hiện kết quả.");
  const sizes = first.teams.map((team) => team.memberCount);
  const goalkeepers = first.teams.map((team) => team.goalkeeperCount);
  const lowFormCounts = first.teams.map((team) => team.lowFormCount);
  const attackCounts = first.teams.map((team) => team.strengthCounts.ATTACK);
  const defenseCounts = first.teams.map((team) => team.strengthCounts.DEFENSE);
  if (sizes.reduce((sum, size) => sum + size, 0) !== memberCount) throw new Error("Thiếu người trong kết quả.");
  if (Math.min(...sizes) < 1 || Math.max(...sizes) - Math.min(...sizes) > 1) throw new Error("Quân số không hợp lệ.");
  if (goalkeepers.some((count) => count !== 1)) throw new Error("Mỗi đội phải có đúng một thủ môn.");
  for (const tier of ["TIER_1", "TIER_2", "TIER_3", "TIER_4", "TIER_5", "TIER_6", "TIER_7"] as const) {
    const counts = first.teams.map((team) => team.tierCounts[tier]);
    if (Math.max(...counts) - Math.min(...counts) > 1) throw new Error(`${tier} bị gom quá nhiều vào một đội.`);
  }
  if (Math.max(...lowFormCounts) - Math.min(...lowFormCounts) > 1) throw new Error("Người có phong độ thấp chưa được phân bổ đều.");
  if (Math.max(...attackCounts) - Math.min(...attackCounts) > 1) throw new Error(`Cầu thủ thiên công chưa đều ở case ${memberCount}/${teamCount}.`);
  if (Math.max(...defenseCounts) - Math.min(...defenseCounts) > 1) throw new Error(`Cầu thủ thiên thủ chưa đều ở case ${memberCount}/${teamCount}.`);
  for (const position of ["DEFENDER", "MIDFIELDER", "FORWARD"] as const) {
    const counts = first.teams.map((team) => team.positionCounts[position]);
    if (Math.max(...counts) - Math.min(...counts) > 1) throw new Error(`Vị trí ${position} chưa đều ở case ${memberCount}/${teamCount}: ${counts.join("-")}.`);
  }
}

const concentratedTopTier = participants(13).map((participant, index) => ({
  ...participant,
  seedTier: (index < 4 ? "TIER_1" : index < 6 ? "TIER_2" : "TIER_4") as SeedTier,
  goalkeeperAvailable: index === 11 || index === 12,
}));
const fivePlayerResult = generateBalancedTeams(concentratedTopTier, 2, "five-player-lineup-regression");
const tierOneCounts = fivePlayerResult.teams.map((team) => team.tierCounts.TIER_1);
if (tierOneCounts.some((count) => count !== 2)) {
  throw new Error("Bốn cầu thủ Tier 1 phải được chia 2–2 cho hai đội hình sân 5.");
}
if (Math.max(...fivePlayerResult.teams.map((team) => team.lineupSkillScore))
  - Math.min(...fivePlayerResult.teams.map((team) => team.lineupSkillScore)) > 2) {
  throw new Error("Sức mạnh đội hình chính 1 thủ môn + 4 cầu thủ sân còn chênh quá lớn.");
}

try {
  generateBalancedTeams(participants(9), 2, "too-few");
  throw new Error("Phải từ chối trận có ít hơn 10 người.");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("ít nhất 10")) throw error;
}

console.log("Team balancer tests passed.");
