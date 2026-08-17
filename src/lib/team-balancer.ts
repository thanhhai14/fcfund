import type { PlayerPosition, PlayerStrength } from "@/lib/player-profile";
import { ACTIVE_SEED_TIERS, SEED_WEIGHT, type SeedTier } from "@/lib/seed-tier";

export type { SeedTier } from "@/lib/seed-tier";

export type BalanceParticipant = {
  participantId: string; memberId: string | null; name: string; seedTier: SeedTier;
  goalkeeperAvailable: boolean; assignedAsGoalkeeper?: boolean;
  recentMatchCount: number; recentLossCount: number; recentLossRate: number | null;
  formScore: number; formConfidence: number; inferredMatchCount: number; lowForm: boolean;
  desiredPositions: PlayerPosition[]; playerStrength: PlayerStrength | null;
  lockedTeamIndex?: number; lockedAsGoalkeeper?: boolean;
};

export type BalancedTeam = {
  index: number; members: BalanceParticipant[]; memberCount: number; goalkeeperCount: number;
  skillScore: number; recentLossScore: number; formScoreTotal: number; lowFormCount: number;
  lineupMemberCount: number; lineupSkillScore: number; lineupFormScore: number;
  tierCounts: Record<SeedTier, number>; positionCounts: Record<PlayerPosition, number>;
  strengthCounts: Record<PlayerStrength, number>;
};

const GOALKEEPER_FACTOR = 0.15;
const STARTING_OUTFIELD_COUNT = 4;
const BENCH_FACTOR = 0.25;

function hashKey(value: string) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function seededRandom(key: string) { let state = hashKey(key) || 1; return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }; }
function shuffled<T>(rows: T[], random: () => number) { const result = [...rows]; for (let index = result.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(random() * (index + 1)); [result[index], result[swapIndex]] = [result[swapIndex], result[index]]; } return result; }
function spread(values: number[]) { return values.length ? Math.max(...values) - Math.min(...values) : 0; }

function startingLineup(members: BalanceParticipant[]) {
  const goalkeeper = members.find((member) => member.assignedAsGoalkeeper);
  const outfield = members.filter((member) => !member.assignedAsGoalkeeper)
    .sort((first, second) => SEED_WEIGHT[second.seedTier] - SEED_WEIGHT[first.seedTier]
      || second.formScore - first.formScore
      || first.participantId.localeCompare(second.participantId))
    .slice(0, STARTING_OUTFIELD_COUNT);
  const positionCounts: Record<Exclude<PlayerPosition, "GOALKEEPER">, number> = { DEFENDER: 0, MIDFIELDER: 0, FORWARD: 0 };
  const strengthCounts: Record<PlayerStrength, number> = { DEFENSE: 0, ATTACK: 0 };
  for (const member of outfield) {
    for (const position of member.desiredPositions) {
      if (position !== "GOALKEEPER") positionCounts[position] += 1;
    }
    if (member.playerStrength) strengthCounts[member.playerStrength] += 1;
  }
  const goalkeeperWeight = goalkeeper ? GOALKEEPER_FACTOR : 0;
  const formWeight = outfield.length + goalkeeperWeight;
  return {
    memberCount: outfield.length + Number(Boolean(goalkeeper)),
    skillScore: outfield.reduce((sum, member) => sum + SEED_WEIGHT[member.seedTier], 0)
      + (goalkeeper ? SEED_WEIGHT[goalkeeper.seedTier] * GOALKEEPER_FACTOR : 0),
    formScore: formWeight ? (outfield.reduce((sum, member) => sum + member.formScore, 0)
      + (goalkeeper ? goalkeeper.formScore * GOALKEEPER_FACTOR : 0)) / formWeight : 0,
    positionCounts,
    strengthCounts,
  };
}

function summarize(index: number, members: BalanceParticipant[]): BalancedTeam {
  const tierCounts = Object.fromEntries(ACTIVE_SEED_TIERS.map((tier) => [tier, 0])) as Record<SeedTier, number>;
  const positionCounts: Record<PlayerPosition, number> = { GOALKEEPER: 0, DEFENDER: 0, MIDFIELDER: 0, FORWARD: 0 };
  const strengthCounts: Record<PlayerStrength, number> = { DEFENSE: 0, ATTACK: 0 };
  let goalkeeperCount = 0, skillScore = 0, recentLossScore = 0, formScoreTotal = 0, lowFormCount = 0;
  for (const member of members) {
    const factor = member.assignedAsGoalkeeper ? GOALKEEPER_FACTOR : 1;
    if (member.assignedAsGoalkeeper) goalkeeperCount += 1;
    else {
      tierCounts[member.seedTier] += 1;
      for (const position of member.desiredPositions.filter((position) => position !== "GOALKEEPER")) positionCounts[position] += 1;
      if (member.playerStrength) strengthCounts[member.playerStrength] += 1;
      if (member.lowForm) lowFormCount += 1;
    }
    skillScore += SEED_WEIGHT[member.seedTier] * factor;
    recentLossScore += (10_000 - member.formScore) * factor;
    formScoreTotal += member.formScore * factor;
  }
  const lineup = startingLineup(members);
  return {
    index, members, memberCount: members.length, goalkeeperCount,
    skillScore: Math.round(skillScore), recentLossScore: Math.round(recentLossScore),
    formScoreTotal: Math.round(formScoreTotal), lowFormCount,
    lineupMemberCount: lineup.memberCount, lineupSkillScore: Math.round(lineup.skillScore * 100) / 100,
    lineupFormScore: Math.round(lineup.formScore), tierCounts, positionCounts, strengthCounts,
  };
}

export function balanceCost(teams: BalanceParticipant[][]) {
  const summaries = teams.map((members, index) => summarize(index + 1, members));
  const sizeGap = spread(summaries.map((team) => team.memberCount));
  const goalkeeperGap = spread(summaries.map((team) => team.goalkeeperCount));
  const skillGap = spread(summaries.map((team) => team.skillScore));
  const formGap = spread(summaries.map((team) => team.memberCount ? team.formScoreTotal / team.memberCount : 0));
  const tierSpreads = ACTIVE_SEED_TIERS.map((tier) => spread(summaries.map((team) => team.tierCounts[tier])));
  const tierGap = tierSpreads.reduce((sum, gap) => sum + gap, 0);
  const tierExcess = tierSpreads.reduce((sum, gap) => sum + Math.max(0, gap - 1), 0);
  const lineups = teams.map(startingLineup);
  const lineupSizeGap = spread(lineups.map((lineup) => lineup.memberCount));
  const lineupSkillGap = spread(lineups.map((lineup) => lineup.skillScore));
  const lineupFormGap = spread(lineups.map((lineup) => lineup.formScore));
  const lineupPositionGap = (["DEFENDER", "MIDFIELDER", "FORWARD"] as const)
    .reduce((sum, position) => sum + spread(lineups.map((lineup) => lineup.positionCounts[position])), 0);
  const lineupStrengthGap = (["DEFENSE", "ATTACK"] as const)
    .reduce((sum, strength) => sum + spread(lineups.map((lineup) => lineup.strengthCounts[strength])), 0);
  const positionGap = (["DEFENDER", "MIDFIELDER", "FORWARD"] as const).reduce((sum, position) => sum + spread(summaries.map((team) => team.positionCounts[position])), 0);
  const strengthGap = (["DEFENSE", "ATTACK"] as const).reduce((sum, strength) => sum + spread(summaries.map((team) => team.strengthCounts[strength])), 0);
  const positionExcess = (["DEFENDER", "MIDFIELDER", "FORWARD"] as const)
    .reduce((sum, position) => sum + Math.max(0, spread(summaries.map((team) => team.positionCounts[position])) - 1), 0);
  const strengthExcess = (["DEFENSE", "ATTACK"] as const)
    .reduce((sum, strength) => sum + Math.max(0, spread(summaries.map((team) => team.strengthCounts[strength])) - 1), 0);
  const missingCoverage = summaries.reduce((sum, team) => sum + Number(!(team.positionCounts.DEFENDER || team.positionCounts.MIDFIELDER || team.strengthCounts.DEFENSE)) + Number(!(team.positionCounts.FORWARD || team.positionCounts.MIDFIELDER || team.strengthCounts.ATTACK)), 0);
  return sizeGap * 1e12
    + goalkeeperGap * 1e11
    + tierExcess * 1e10
    + positionExcess * 5e9
    + strengthExcess * 2e9
    + lineupSizeGap * 1e9
    + missingCoverage * 1e8
    + lineupSkillGap * 1e7
    + lineupPositionGap * 2e6
    + skillGap * 1e7 * BENCH_FACTOR
    + lineupStrengthGap * 1e6
    + positionGap * 5e5
    + strengthGap * 2e5
    + tierGap * 1e5
    + spread(summaries.map((team) => team.lowFormCount)) * 2e4
    + lineupFormGap * 10
    + formGap;
}

export function generateBalancedTeams(participants: BalanceParticipant[], teamCount: number, randomKey: string) {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error("Số đội phải từ 2 trở lên.");
  if (participants.length < 10) throw new Error("Cần ít nhất 10 người tham gia để tạo đội.");
  if (teamCount > participants.length) throw new Error("Số đội không được vượt quá số người tham gia.");
  if (participants.some((row) => !ACTIVE_SEED_TIERS.includes(row.seedTier))) throw new Error("Tất cả người tham gia phải có Seed Tier 1–7.");
  if (participants.filter((row) => row.goalkeeperAvailable).length < teamCount) throw new Error(`Cần ít nhất ${teamCount} người có thể bắt gôn để mỗi đội có một thủ môn.`);

  const random = seededRandom(randomKey);
  const targetSizes = Array.from({ length: teamCount }, (_, index) => Math.floor(participants.length / teamCount) + Number(index < participants.length % teamCount));
  const teams: BalanceParticipant[][] = Array.from({ length: teamCount }, () => []);
  const locked = participants.filter((row) => row.lockedTeamIndex).map((row) => ({ ...row, assignedAsGoalkeeper: Boolean(row.lockedAsGoalkeeper) }));
  for (const player of locked) {
    const index = player.lockedTeamIndex! - 1;
    if (index < 0 || index >= teamCount) throw new Error("Đội đã khóa không còn hợp lệ với số đội mới.");
    teams[index].push(player);
  }
  if (teams.some((team, index) => team.length > targetSizes[index])) throw new Error("Số người bị khóa khiến quân số không thể cân bằng.");
  if (teams.some((team) => team.filter((row) => row.assignedAsGoalkeeper).length > 1)) throw new Error("Một đội đang khóa nhiều hơn một thủ môn.");

  const unlocked = participants.filter((row) => !row.lockedTeamIndex);
  const lockedKeeperIds = new Set(locked.filter((row) => row.assignedAsGoalkeeper).map((row) => row.participantId));
  const keeperSlots = teamCount - lockedKeeperIds.size;
  const candidates = shuffled(unlocked.filter((row) => row.goalkeeperAvailable), random).sort((a, b) => {
    const aOutfield = a.desiredPositions.filter((position) => position !== "GOALKEEPER").length;
    const bOutfield = b.desiredPositions.filter((position) => position !== "GOALKEEPER").length;
    return aOutfield - bOutfield;
  });
  if (candidates.length < keeperSlots) throw new Error(`Cần thêm ${keeperSlots - candidates.length} người có thể bắt gôn.`);
  const selectedKeeperIds = new Set(candidates.slice(0, keeperSlots).map((row) => row.participantId));
  const outfield = ACTIVE_SEED_TIERS.flatMap((tier) => shuffled(unlocked.filter((row) => row.seedTier === tier && !selectedKeeperIds.has(row.participantId)), random));

  for (const participant of outfield) {
    const candidatesForTeam = teams.map((members, index) => {
      const reservedKeeper = members.some((row) => row.assignedAsGoalkeeper) ? 0 : 1;
      if (members.length >= targetSizes[index] - reservedKeeper) return null;
      const player = { ...participant, assignedAsGoalkeeper: false };
      const proposal = teams.map((team, teamIndex) => teamIndex === index ? [...team, player] : team);
      return { index, cost: balanceCost(proposal), tie: random(), player };
    }).filter((row): row is NonNullable<typeof row> => row !== null).sort((a, b) => a.cost - b.cost || a.tie - b.tie);
    if (!candidatesForTeam.length) throw new Error("Không còn vị trí cầu thủ sân phù hợp; hãy mở khóa đội hình và thử lại.");
    teams[candidatesForTeam[0].index].push(candidatesForTeam[0].player);
  }

  const keepers = shuffled(unlocked.filter((row) => selectedKeeperIds.has(row.participantId)), random);
  for (const participant of keepers) {
    const candidatesForTeam = teams.map((members, index) => ({ index, members, tie: random() }))
      .filter((row) => row.members.length < targetSizes[row.index] && !row.members.some((member) => member.assignedAsGoalkeeper))
      .map((row) => { const player = { ...participant, assignedAsGoalkeeper: true }; const proposal = teams.map((team, index) => index === row.index ? [...team, player] : team); return { ...row, player, cost: balanceCost(proposal) }; })
      .sort((a, b) => a.cost - b.cost || a.tie - b.tie);
    if (!candidatesForTeam.length) throw new Error("Không thể phân bổ đủ một thủ môn cho mỗi đội.");
    teams[candidatesForTeam[0].index].push(candidatesForTeam[0].player);
  }

  let currentCost = balanceCost(teams);
  // Local search is deliberately sampled: exhaustive swaps become quadratic per
  // iteration and made larger livestream lineups unnecessarily slow.
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let best: { a: number; ai: number; b: number; bi: number; cost: number } | null = null;
    for (let attempt = 0; attempt < 320; attempt += 1) {
      const a = Math.floor(random() * teams.length);
      let b = Math.floor(random() * (teams.length - 1));
      if (b >= a) b += 1;
      const firstTeam = Math.min(a, b), secondTeam = Math.max(a, b);
      const ai = Math.floor(random() * teams[firstTeam].length);
      const bi = Math.floor(random() * teams[secondTeam].length);
      const actualA = firstTeam, actualB = secondTeam;
      const first = teams[actualA][ai], second = teams[actualB][bi];
      if (first.lockedTeamIndex || second.lockedTeamIndex || Boolean(first.assignedAsGoalkeeper) !== Boolean(second.assignedAsGoalkeeper)) continue;
      const proposal = teams.map((team) => [...team]); [proposal[actualA][ai], proposal[actualB][bi]] = [proposal[actualB][bi], proposal[actualA][ai]];
      const cost = balanceCost(proposal); if (cost < currentCost && (!best || cost < best.cost)) best = { a: actualA, ai, b: actualB, bi, cost };
    }
    if (!best) break;
    [teams[best.a][best.ai], teams[best.b][best.bi]] = [teams[best.b][best.bi], teams[best.a][best.ai]]; currentCost = best.cost;
  }
  const summaries = teams.map((members, index) => summarize(index + 1, members));
  if (summaries.some((team) => team.goalkeeperCount !== 1)) throw new Error("Mỗi đội phải có đúng một thủ môn.");
  const unevenTier = ACTIVE_SEED_TIERS.find((tier) => spread(summaries.map((team) => team.tierCounts[tier])) > 1);
  if (unevenTier) throw new Error(`Không thể phân bổ đều ${unevenTier.replace("TIER_", "Tier ")}; hãy mở khóa các cầu thủ đã giữ đội và thử lại.`);
  return { teams: summaries, cost: currentCost };
}
