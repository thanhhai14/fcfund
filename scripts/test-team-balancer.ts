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

for (const [memberCount, teamCount] of [[10, 2], [14, 3], [18, 4], [19, 4], [20, 2], [30, 5]] as const) {
  const goalkeeperCount = Math.max(2, Math.min(teamCount, memberCount - teamCount * 4));
  const input = participants(memberCount).map((participant, index) => ({ ...participant, goalkeeperAvailable: index < goalkeeperCount }));
  const first = generateBalancedTeams(input, teamCount, `test-${memberCount}-${teamCount}`);
  const repeated = generateBalancedTeams(input, teamCount, `test-${memberCount}-${teamCount}`);
  if (JSON.stringify(first) !== JSON.stringify(repeated)) throw new Error("Random key không tái hiện kết quả.");
  const sizes = first.teams.map((team) => team.memberCount);
  const goalkeepers = first.teams.map((team) => team.goalkeeperCount);
  const lowFormCounts = first.teams.map((team) => team.lowFormCount);
  if (sizes.reduce((sum, size) => sum + size, 0) !== memberCount) throw new Error("Thiếu người trong kết quả.");
  if (Math.min(...sizes) < 1 || Math.max(...sizes) - Math.min(...sizes) > 1) throw new Error("Quân số không hợp lệ.");
  if (goalkeepers.some((count) => count > 1) || goalkeepers.reduce((sum, count) => sum + count, 0) < 2) {
    throw new Error("Phân bổ thủ môn thật không hợp lệ.");
  }
  for (const tier of ["TIER_1", "TIER_2", "TIER_3", "TIER_4", "TIER_5", "TIER_6", "TIER_7"] as const) {
    const counts = first.teams.map((team) => team.tierCounts[tier]);
    if (Math.max(...counts) - Math.min(...counts) > 1) throw new Error(`${tier} bị gom quá nhiều vào một đội.`);
  }
  if (Math.max(...lowFormCounts) - Math.min(...lowFormCounts) > 1) throw new Error("Người có phong độ thấp chưa được phân bổ đều.");
  if (first.teams.some((team) => !team.lineupHasDefense || !team.lineupHasAttack)) {
    throw new Error(`Đội hình chính chưa đủ khả năng công/thủ ở case ${memberCount}/${teamCount}.`);
  }
}

for (const testCase of [
  { memberCount: 14, teamCount: 3, goalkeeperCount: 2, expectedSizes: "5-5-4" },
  { memberCount: 19, teamCount: 4, goalkeeperCount: 3, expectedSizes: "5-5-5-4" },
] as const) {
  const input = participants(testCase.memberCount).map((participant, index) => ({
    ...participant,
    goalkeeperAvailable: index < testCase.goalkeeperCount,
  }));
  const result = generateBalancedTeams(input, testCase.teamCount, `borrowed-goalkeeper-${testCase.teamCount}`);
  const sizes = result.teams.map((team) => team.memberCount).sort((first, second) => second - first).join("-");
  const borrowedTeams = result.teams.filter((team) => team.usesBorrowedGoalkeeper);
  if (sizes !== testCase.expectedSizes) throw new Error(`Quân số mượn thủ môn sai: ${sizes}.`);
  if (borrowedTeams.length !== testCase.teamCount - testCase.goalkeeperCount) {
    throw new Error("Số đội mượn thủ môn không đúng.");
  }
  if (borrowedTeams.some((team) => team.lineupMemberCount !== 5)) {
    throw new Error("Đội mượn thủ môn phải được chấm như đội hình đủ 5 người.");
  }
}

try {
  const insufficientForThreeKeepers = participants(18).map((participant, index) => ({ ...participant, goalkeeperAvailable: index < 3 }));
  generateBalancedTeams(insufficientForThreeKeepers, 4, "insufficient-for-three-goalkeepers");
  throw new Error("18 người/4 đội/3 thủ môn phải bị từ chối vì cần tối thiểu 19 người.");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("ít nhất 19 người")) throw error;
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

const goalkeeperWeightInput = participants(10).map((participant, index) => ({
  ...participant,
  seedTier: (index === 0 ? "TIER_1" : index === 1 ? "TIER_7" : "TIER_4") as SeedTier,
  goalkeeperAvailable: index < 2,
}));
const goalkeeperWeightResult = generateBalancedTeams(goalkeeperWeightInput, 2, "goalkeeper-ten-percent-regression");
const goalkeeperLineupGap = Math.max(...goalkeeperWeightResult.teams.map((team) => team.lineupSkillScore))
  - Math.min(...goalkeeperWeightResult.teams.map((team) => team.lineupSkillScore));
if (Math.abs(goalkeeperLineupGap - 0.6) > 0.001) {
  throw new Error(`Tier thủ môn chưa được tính đúng 10%: chênh lệch ${goalkeeperLineupGap}.`);
}

try {
  generateBalancedTeams(participants(9), 2, "too-few");
  throw new Error("Phải từ chối trận có ít hơn 10 người.");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("ít nhất 10")) throw error;
}

console.log("Team balancer tests passed.");
