import type { PlayerPosition, PlayerStrength } from "@/lib/player-profile";
import { ACTIVE_SEED_TIERS, SEED_WEIGHT, type SeedTier } from "@/lib/seed-tier";
import { MINIMUM_SHARED_GOALKEEPERS, minimumParticipantsForTeams, OUTFIELD_STARTERS_PER_TEAM, plannedGoalkeeperCount } from "@/lib/team-roster-rules";

export type { SeedTier } from "@/lib/seed-tier";

export type BalanceParticipant = {
  participantId: string; memberId: string | null; name: string; seedTier: SeedTier;
  goalkeeperAvailable: boolean; assignedAsGoalkeeper?: boolean;
  recentMatchCount: number; recentLossCount: number; recentLossRate: number | null;
  formScore: number; formConfidence: number; inferredMatchCount: number; lowForm: boolean;
  desiredPositions: PlayerPosition[]; playerStrength: PlayerStrength | null;
  lockedTeamIndex?: number; lockedAsGoalkeeper?: boolean;
};

type OutfieldPosition = Exclude<PlayerPosition, "GOALKEEPER">;
type RoleCounts = Record<OutfieldPosition, number>;
type StrengthCounts = Record<PlayerStrength, number>;

export type BalancedTeam = {
  index: number; members: BalanceParticipant[]; memberCount: number; goalkeeperCount: number;
  skillScore: number; tierPower: number; recentLossScore: number; formScoreTotal: number; lowFormCount: number;
  lineupMemberCount: number; lineupSkillScore: number; lineupFormScore: number;
  lineupHasDefense: boolean; lineupHasAttack: boolean; usesBorrowedGoalkeeper: boolean;
  lineupPositionCounts: RoleCounts; lineupStrengthCounts: StrengthCounts;
  tierCounts: Record<SeedTier, number>; positionCounts: Record<PlayerPosition, number>;
  strengthCounts: StrengthCounts;
};

const GOALKEEPER_SEED_FACTOR = 0.1;
const GOALKEEPER_FORM_FACTOR = 0.15;
const BENCH_SEED_FACTOR = 0.25;
const STARTING_OUTFIELD_COUNT = OUTFIELD_STARTERS_PER_TEAM;
const INITIAL_CANDIDATE_COUNT = 12;

function emptyRoleCounts(): RoleCounts { return { DEFENDER: 0, MIDFIELDER: 0, FORWARD: 0 }; }
function emptyStrengthCounts(): StrengthCounts { return { DEFENSE: 0, ATTACK: 0 }; }
function hashKey(value: string) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function seededRandom(key: string) { let state = hashKey(key) || 1; return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }; }
function shuffled<T>(rows: T[], random: () => number) { const result = [...rows]; for (let index = result.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(random() * (index + 1)); [result[index], result[swapIndex]] = [result[swapIndex], result[index]]; } return result; }
function spread(values: number[]) { return values.length ? Math.max(...values) - Math.min(...values) : 0; }

function roleOptions(member: BalanceParticipant): Array<OutfieldPosition | null> {
  const positions = member.desiredPositions.filter((position): position is OutfieldPosition => position !== "GOALKEEPER");
  return positions.length ? positions : [null];
}

function assignVirtualRoles(members: BalanceParticipant[]) {
  const counts = emptyRoleCounts();
  const strengthCounts = emptyStrengthCounts();
  for (const member of members) if (member.playerStrength) strengthCounts[member.playerStrength] += 1;
  const target: RoleCounts = {
    DEFENDER: Math.round(members.length * 0.25),
    MIDFIELDER: Math.round(members.length * 0.25),
    FORWARD: Math.max(0, members.length - Math.round(members.length * 0.25) * 2),
  };
  const ordered = [...members].sort((first, second) => roleOptions(first).length - roleOptions(second).length
    || SEED_WEIGHT[second.seedTier] - SEED_WEIGHT[first.seedTier]
    || first.participantId.localeCompare(second.participantId));
  for (const member of ordered) {
    const options = roleOptions(member).filter((role): role is OutfieldPosition => role !== null);
    if (!options.length) continue;
    options.sort((first, second) => (target[second] - counts[second]) - (target[first] - counts[first])
      || ["DEFENDER", "MIDFIELDER", "FORWARD"].indexOf(first) - ["DEFENDER", "MIDFIELDER", "FORWARD"].indexOf(second));
    counts[options[0]] += 1;
  }
  const hasDefense = counts.DEFENDER > 0 || counts.MIDFIELDER > 0 || strengthCounts.DEFENSE > 0;
  const hasAttack = counts.FORWARD > 0 || counts.MIDFIELDER > 0 || strengthCounts.ATTACK > 0;
  const shapePenalty = Math.abs(counts.DEFENDER - target.DEFENDER)
    + Math.abs(counts.MIDFIELDER - target.MIDFIELDER)
    + Math.abs(counts.FORWARD - target.FORWARD);
  return { counts, strengthCounts, hasDefense, hasAttack, penalty: Number(!hasDefense) * 100 + Number(!hasAttack) * 100 + shapePenalty };
}

type BorrowedGoalkeeper = { seedWeight: number; formScore: number };

function startingLineup(members: BalanceParticipant[], borrowedGoalkeeper: BorrowedGoalkeeper | null = null) {
  const goalkeeper = members.find((member) => member.assignedAsGoalkeeper);
  const allOutfield = members.filter((member) => !member.assignedAsGoalkeeper);
  const rankedOutfield = [...allOutfield].sort((first, second) => SEED_WEIGHT[second.seedTier] - SEED_WEIGHT[first.seedTier]
    || second.formScore - first.formScore || first.participantId.localeCompare(second.participantId));
  let selectedOutfield = rankedOutfield.slice(0, STARTING_OUTFIELD_COUNT);
  for (let pass = 0; pass < 2; pass += 1) {
    const currentRoles = assignVirtualRoles(selectedOutfield);
    if (currentRoles.hasDefense && currentRoles.hasAttack) break;
    const starterIds = new Set(selectedOutfield.map((member) => member.participantId));
    const benchCandidates = rankedOutfield.filter((member) => !starterIds.has(member.participantId));
    const alternatives = benchCandidates.flatMap((incoming) => selectedOutfield.map((_, replaceIndex) => {
      const outfield = selectedOutfield.map((member, index) => index === replaceIndex ? incoming : member);
      const roles = assignVirtualRoles(outfield);
      return {
        outfield,
        coverageMissing: Number(!roles.hasDefense) + Number(!roles.hasAttack),
        seedScore: outfield.reduce((sum, member) => sum + SEED_WEIGHT[member.seedTier], 0),
        formScore: outfield.reduce((sum, member) => sum + member.formScore, 0),
      };
    })).sort((first, second) => first.coverageMissing - second.coverageMissing
      || second.seedScore - first.seedScore || second.formScore - first.formScore);
    if (!alternatives.length || alternatives[0].coverageMissing >= Number(!currentRoles.hasDefense) + Number(!currentRoles.hasAttack)) break;
    selectedOutfield = alternatives[0].outfield;
  }
  const selectedRoles = assignVirtualRoles(selectedOutfield);
  const selectedSeedScore = selectedOutfield.reduce((sum, member) => sum + SEED_WEIGHT[member.seedTier], 0);
  const starterIds = new Set(selectedOutfield.map((member) => member.participantId));
  const bench = allOutfield.filter((member) => !starterIds.has(member.participantId));
  const goalkeeperSeed = goalkeeper
    ? SEED_WEIGHT[goalkeeper.seedTier] * GOALKEEPER_SEED_FACTOR
    : borrowedGoalkeeper ? borrowedGoalkeeper.seedWeight * GOALKEEPER_SEED_FACTOR : 0;
  const goalkeeperForm = goalkeeper
    ? goalkeeper.formScore * GOALKEEPER_FORM_FACTOR
    : borrowedGoalkeeper ? borrowedGoalkeeper.formScore * GOALKEEPER_FORM_FACTOR : 0;
  const hasEffectiveGoalkeeper = Boolean(goalkeeper || borrowedGoalkeeper);
  const formWeight = selectedOutfield.length + (hasEffectiveGoalkeeper ? GOALKEEPER_FORM_FACTOR : 0);
  return {
    outfield: selectedOutfield,
    bench,
    memberCount: selectedOutfield.length + Number(hasEffectiveGoalkeeper),
    skillScore: selectedSeedScore + goalkeeperSeed,
    tierPower: selectedSeedScore + goalkeeperSeed + bench.reduce((sum, member) => sum + SEED_WEIGHT[member.seedTier] * BENCH_SEED_FACTOR, 0),
    formScore: formWeight ? (selectedOutfield.reduce((sum, member) => sum + member.formScore, 0) + goalkeeperForm) / formWeight : 0,
    roles: selectedRoles,
    benchRoles: assignVirtualRoles(bench),
    usesBorrowedGoalkeeper: !goalkeeper && Boolean(borrowedGoalkeeper),
  };
}

function summarize(index: number, members: BalanceParticipant[], borrowedGoalkeeper: BorrowedGoalkeeper | null): BalancedTeam {
  const tierCounts = Object.fromEntries(ACTIVE_SEED_TIERS.map((tier) => [tier, 0])) as Record<SeedTier, number>;
  const outfield = members.filter((member) => !member.assignedAsGoalkeeper);
  const allRoles = assignVirtualRoles(outfield);
  let goalkeeperCount = 0, skillScore = 0, recentLossScore = 0, formScoreTotal = 0, lowFormCount = 0;
  for (const member of members) {
    if (member.assignedAsGoalkeeper) goalkeeperCount += 1;
    else { tierCounts[member.seedTier] += 1; if (member.lowForm) lowFormCount += 1; }
    skillScore += SEED_WEIGHT[member.seedTier] * (member.assignedAsGoalkeeper ? GOALKEEPER_SEED_FACTOR : 1);
    recentLossScore += (10_000 - member.formScore) * (member.assignedAsGoalkeeper ? GOALKEEPER_FORM_FACTOR : 1);
    formScoreTotal += member.formScore * (member.assignedAsGoalkeeper ? GOALKEEPER_FORM_FACTOR : 1);
  }
  const lineup = startingLineup(members, borrowedGoalkeeper);
  return {
    index, members, memberCount: members.length, goalkeeperCount,
    skillScore: Math.round(skillScore * 100) / 100, tierPower: Math.round(lineup.tierPower * 100) / 100,
    recentLossScore: Math.round(recentLossScore), formScoreTotal: Math.round(formScoreTotal), lowFormCount,
    lineupMemberCount: lineup.memberCount, lineupSkillScore: Math.round(lineup.skillScore * 100) / 100,
    lineupFormScore: Math.round(lineup.formScore), lineupHasDefense: lineup.roles.hasDefense, lineupHasAttack: lineup.roles.hasAttack,
    usesBorrowedGoalkeeper: lineup.usesBorrowedGoalkeeper,
    lineupPositionCounts: lineup.roles.counts, lineupStrengthCounts: lineup.roles.strengthCounts,
    tierCounts,
    positionCounts: { GOALKEEPER: goalkeeperCount, ...allRoles.counts },
    strengthCounts: allRoles.strengthCounts,
  };
}

function summarizeTeams(teams: BalanceParticipant[][]) {
  const goalkeepers = teams.flatMap((team) => team.filter((member) => member.assignedAsGoalkeeper));
  const borrowedGoalkeeper: BorrowedGoalkeeper | null = goalkeepers.length ? {
    seedWeight: goalkeepers.reduce((sum, member) => sum + SEED_WEIGHT[member.seedTier], 0) / goalkeepers.length,
    formScore: goalkeepers.reduce((sum, member) => sum + member.formScore, 0) / goalkeepers.length,
  } : null;
  return teams.map((members, index) => summarize(
    index + 1,
    members,
    members.some((member) => member.assignedAsGoalkeeper) ? null : borrowedGoalkeeper,
  ));
}

export function balanceCost(teams: BalanceParticipant[][]) {
  const summaries = summarizeTeams(teams);
  const sizeGap = spread(summaries.map((team) => team.memberCount));
  const goalkeeperGap = spread(summaries.map((team) => team.goalkeeperCount));
  const tierSpreads = ACTIVE_SEED_TIERS.map((tier) => spread(summaries.map((team) => team.tierCounts[tier])));
  const tierExcess = tierSpreads.reduce((sum, gap) => sum + Math.max(0, gap - 1), 0);
  const lineupSizeGap = spread(summaries.map((team) => team.lineupMemberCount));
  const missingCoverage = summaries.reduce((sum, team) => sum + Number(!team.lineupHasDefense) + Number(!team.lineupHasAttack), 0);

  const maxTierPower = Math.max(1, ...summaries.map((team) => team.tierPower));
  const tierDifference = spread(summaries.map((team) => team.tierPower)) / maxTierPower;
  const roleDifference = Math.min(1, (["DEFENDER", "MIDFIELDER", "FORWARD"] as const)
    .reduce((sum, position) => sum + spread(summaries.map((team) => team.positionCounts[position])), 0) / 12);
  const strengthDifference = Math.min(1, (["DEFENSE", "ATTACK"] as const)
    .reduce((sum, strength) => sum + spread(summaries.map((team) => team.strengthCounts[strength])), 0) / 8);
  const lineupRoleDifference = Math.min(1, (["DEFENDER", "MIDFIELDER", "FORWARD"] as const)
    .reduce((sum, position) => sum + spread(summaries.map((team) => team.lineupPositionCounts[position])), 0) / 12);
  const lineupStrengthDifference = Math.min(1, (["DEFENSE", "ATTACK"] as const)
    .reduce((sum, strength) => sum + spread(summaries.map((team) => team.lineupStrengthCounts[strength])), 0) / 8);
  const tacticalDifference = 0.8 * (0.7 * lineupRoleDifference + 0.3 * lineupStrengthDifference)
    + 0.2 * (0.7 * roleDifference + 0.3 * strengthDifference);
  const formDifference = spread(summaries.map((team) => team.lineupFormScore)) / 10_000;
  const softCost = (0.75 * tierDifference + 0.2 * tacticalDifference + 0.05 * formDifference) * 100_000_000;

  return sizeGap * 1e13
    + goalkeeperGap * 1e12
    + tierExcess * 1e11
    + lineupSizeGap * 1e10
    + missingCoverage * 1e9
    + softCost;
}

function validateInput(participants: BalanceParticipant[], teamCount: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error("Số đội phải từ 2 trở lên.");
  if (participants.length < 10) throw new Error("Cần ít nhất 10 người tham gia để tạo đội.");
  if (teamCount > participants.length) throw new Error("Số đội không được vượt quá số người tham gia.");
  if (participants.some((row) => !ACTIVE_SEED_TIERS.includes(row.seedTier))) throw new Error("Tất cả người tham gia phải có Seed Tier 1–7.");
  const goalkeeperCandidates = participants.filter((row) => row.goalkeeperAvailable).length;
  if (goalkeeperCandidates < MINIMUM_SHARED_GOALKEEPERS) throw new Error("Cần ít nhất 2 người được chọn làm thủ môn để có thể luân phiên cho mượn.");
  const minimumParticipants = minimumParticipantsForTeams(teamCount, goalkeeperCandidates);
  if (participants.length < minimumParticipants) {
    const assignedGoalkeepers = plannedGoalkeeperCount(teamCount, goalkeeperCandidates);
    throw new Error(`Chia ${teamCount} đội với ${assignedGoalkeepers} thủ môn cần ít nhất ${minimumParticipants} người (${teamCount * STARTING_OUTFIELD_COUNT} cầu thủ sân + ${assignedGoalkeepers} thủ môn).`);
  }
}

export function generateBalancedTeams(participants: BalanceParticipant[], teamCount: number, randomKey: string) {
  validateInput(participants, teamCount);
  const random = seededRandom(randomKey);
  const locked = participants.filter((row) => row.lockedTeamIndex).map((row) => ({ ...row, assignedAsGoalkeeper: Boolean(row.lockedAsGoalkeeper) }));
  if (locked.some((player) => player.lockedTeamIndex! < 1 || player.lockedTeamIndex! > teamCount)) throw new Error("Đội đã khóa không còn hợp lệ với số đội mới.");
  const lockedTeams: BalanceParticipant[][] = Array.from({ length: teamCount }, () => []);
  for (const player of locked) lockedTeams[player.lockedTeamIndex! - 1].push(player);
  if (lockedTeams.some((team) => team.filter((row) => row.assignedAsGoalkeeper).length > 1)) throw new Error("Một đội đang khóa nhiều hơn một thủ môn.");

  const unlocked = participants.filter((row) => !row.lockedTeamIndex);
  const lockedGoalkeeperCount = locked.filter((row) => row.assignedAsGoalkeeper).length;
  const availableKeepers = unlocked.filter((row) => row.goalkeeperAvailable);
  const goalkeeperCandidates = participants.filter((row) => row.goalkeeperAvailable || row.lockedAsGoalkeeper).length;
  const assignedGoalkeeperCount = plannedGoalkeeperCount(teamCount, goalkeeperCandidates);
  if (lockedGoalkeeperCount > assignedGoalkeeperCount) throw new Error("Số thủ môn đã khóa vượt quá số thủ môn có thể phân công.");
  const keeperSlots = assignedGoalkeeperCount - lockedGoalkeeperCount;
  if (availableKeepers.length < keeperSlots) throw new Error(`Cần thêm ${keeperSlots - availableKeepers.length} người có thể bắt gôn.`);

  const goalkeeperTeamIndexes = new Set(lockedTeams.flatMap((team, index) => team.some((row) => row.assignedAsGoalkeeper) ? [index] : []));
  const remainingTeamIndexes = shuffled(lockedTeams.map((_, index) => index).filter((index) => !goalkeeperTeamIndexes.has(index)), random)
    .sort((first, second) => lockedTeams[second].length - lockedTeams[first].length);
  for (const index of remainingTeamIndexes) {
    if (goalkeeperTeamIndexes.size >= assignedGoalkeeperCount) break;
    goalkeeperTeamIndexes.add(index);
  }
  const targetSizes = Array.from({ length: teamCount }, (_, index) => STARTING_OUTFIELD_COUNT + Number(goalkeeperTeamIndexes.has(index)));
  let extraMembers = participants.length - targetSizes.reduce((sum, size) => sum + size, 0);
  while (extraMembers > 0) {
    const priorities = targetSizes.map((size, index) => ({ index, size, lockedOverflow: Math.max(0, lockedTeams[index].length - size) }))
      .sort((first, second) => second.lockedOverflow - first.lockedOverflow || first.size - second.size || first.index - second.index);
    targetSizes[priorities[0].index] += 1;
    extraMembers -= 1;
  }
  if (lockedTeams.some((team, index) => team.length > targetSizes[index])) throw new Error("Số người bị khóa khiến quân số hoặc phương án mượn thủ môn không thể cân bằng.");

  const candidates: Array<{ teams: BalanceParticipant[][]; cost: number }> = [];
  for (let run = 0; run < INITIAL_CANDIDATE_COUNT; run += 1) {
    const teams = lockedTeams.map((team) => [...team]);
    const selectedKeepers = shuffled(availableKeepers, random).slice(0, keeperSlots);
    const selectedKeeperIds = new Set(selectedKeepers.map((row) => row.participantId));
    const outfield = ACTIVE_SEED_TIERS.flatMap((tier) => shuffled(unlocked.filter((row) => row.seedTier === tier && !selectedKeeperIds.has(row.participantId)), random));
    let valid = true;
    for (const participant of outfield) {
      const options = teams.map((members, index) => {
        const reservedKeeper = goalkeeperTeamIndexes.has(index) && !members.some((row) => row.assignedAsGoalkeeper) ? 1 : 0;
        if (members.length >= targetSizes[index] - reservedKeeper) return null;
        const player = { ...participant, assignedAsGoalkeeper: false };
        const proposal = teams.map((team, teamIndex) => teamIndex === index ? [...team, player] : team);
        return { index, player, cost: balanceCost(proposal), tie: random() };
      }).filter((row): row is NonNullable<typeof row> => row !== null).sort((a, b) => a.cost - b.cost || a.tie - b.tie);
      if (!options.length) { valid = false; break; }
      teams[options[0].index].push(options[0].player);
    }
    if (!valid) continue;
    for (const participant of shuffled(selectedKeepers, random)) {
      const options = teams.map((members, index) => ({ index, members, tie: random() }))
        .filter((row) => goalkeeperTeamIndexes.has(row.index) && row.members.length < targetSizes[row.index] && !row.members.some((member) => member.assignedAsGoalkeeper))
        .map((row) => { const player = { ...participant, assignedAsGoalkeeper: true }; const proposal = teams.map((team, index) => index === row.index ? [...team, player] : team); return { ...row, player, cost: balanceCost(proposal) }; })
        .sort((a, b) => a.cost - b.cost || a.tie - b.tie);
      if (!options.length) { valid = false; break; }
      teams[options[0].index].push(options[0].player);
    }
    if (valid) candidates.push({ teams, cost: balanceCost(teams) });
  }
  if (!candidates.length) throw new Error("Không thể tạo đội hình hợp lệ từ dữ liệu hiện tại.");
  candidates.sort((first, second) => first.cost - second.cost);
  const bestCost = candidates[0].cost;
  const nearBest = candidates.filter((candidate) => candidate.cost <= bestCost * 1.005 + 1);
  const selected = nearBest[Math.floor(random() * nearBest.length)] ?? candidates[0];
  const teams = selected.teams.map((team) => [...team]);

  let currentCost = balanceCost(teams);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    let best: { proposal: BalanceParticipant[][]; cost: number } | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const firstTeam = Math.floor(random() * teams.length);
      let secondTeam = Math.floor(random() * (teams.length - 1)); if (secondTeam >= firstTeam) secondTeam += 1;
      const firstIndex = Math.floor(random() * teams[firstTeam].length);
      const secondIndex = Math.floor(random() * teams[secondTeam].length);
      const first = teams[firstTeam][firstIndex], second = teams[secondTeam][secondIndex];
      if (first.lockedTeamIndex || second.lockedTeamIndex || Boolean(first.assignedAsGoalkeeper) !== Boolean(second.assignedAsGoalkeeper)) continue;
      const proposal = teams.map((team) => [...team]);
      [proposal[firstTeam][firstIndex], proposal[secondTeam][secondIndex]] = [proposal[secondTeam][secondIndex], proposal[firstTeam][firstIndex]];
      const cost = balanceCost(proposal); if (cost < currentCost && (!best || cost < best.cost)) best = { proposal, cost };
    }
    if (teams.length >= 3) for (let attempt = 0; attempt < 36; attempt += 1) {
      const teamIndexes = shuffled(teams.map((_, index) => index), random).slice(0, 3);
      const memberIndexes = teamIndexes.map((teamIndex) => Math.floor(random() * teams[teamIndex].length));
      const rows = teamIndexes.map((teamIndex, index) => teams[teamIndex][memberIndexes[index]]);
      if (rows.some((row) => row.lockedTeamIndex) || new Set(rows.map((row) => Boolean(row.assignedAsGoalkeeper))).size > 1) continue;
      for (const direction of [1, 2]) {
        const proposal = teams.map((team) => [...team]);
        teamIndexes.forEach((teamIndex, index) => { proposal[teamIndex][memberIndexes[index]] = rows[(index + direction) % 3]; });
        const cost = balanceCost(proposal); if (cost < currentCost && (!best || cost < best.cost)) best = { proposal, cost };
      }
    }
    if (!best) break;
    teams.splice(0, teams.length, ...best.proposal); currentCost = best.cost;
  }

  const summaries = summarizeTeams(teams);
  if (summaries.some((team) => team.goalkeeperCount > 1)
    || summaries.reduce((sum, team) => sum + team.goalkeeperCount, 0) !== assignedGoalkeeperCount) {
    throw new Error("Không thể phân bổ đúng số thủ môn đã chọn.");
  }
  if (summaries.some((team) => team.memberCount - team.goalkeeperCount < STARTING_OUTFIELD_COUNT)) {
    throw new Error("Mỗi đội cần ít nhất 4 cầu thủ sân; đội thiếu thủ môn sẽ mượn từ đội nghỉ.");
  }
  const unevenTier = ACTIVE_SEED_TIERS.find((tier) => spread(summaries.map((team) => team.tierCounts[tier])) > 1);
  if (unevenTier) throw new Error(`Không thể phân bổ đều ${unevenTier.replace("TIER_", "Tier ")}; hãy mở khóa các cầu thủ đã giữ đội và thử lại.`);
  if (summaries.some((team) => !team.lineupHasDefense || !team.lineupHasAttack)) throw new Error("Không thể tạo đội hình chính có đủ khả năng tấn công và phòng thủ cho mọi đội.");
  return { teams: summaries, cost: currentCost };
}
