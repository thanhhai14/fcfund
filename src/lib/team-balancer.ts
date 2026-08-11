export type SeedTier = "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4" | "GOALKEEPER";

export type BalanceParticipant = {
  participantId: string;
  memberId: string | null;
  name: string;
  seedTier: SeedTier;
  recentMatchCount: number;
  recentLossCount: number;
  recentLossRate: number | null;
  formScore: number;
  formConfidence: number;
  inferredMatchCount: number;
  lowForm: boolean;
  lockedTeamIndex?: number;
};

export type BalancedTeam = {
  index: number;
  members: BalanceParticipant[];
  memberCount: number;
  goalkeeperCount: number;
  skillScore: number;
  recentLossScore: number;
  formScoreTotal: number;
  lowFormCount: number;
  tierCounts: Record<"TIER_1" | "TIER_2" | "TIER_3" | "TIER_4", number>;
};

const TIER_WEIGHT: Record<SeedTier, number> = {
  TIER_1: 4,
  TIER_2: 3,
  TIER_3: 2,
  TIER_4: 1,
  GOALKEEPER: 0,
};

function hashKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(key: string) {
  let state = hashKey(key) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(rows: T[], random: () => number) {
  const result = [...rows];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function summarize(index: number, members: BalanceParticipant[]): BalancedTeam {
  const tierCounts = { TIER_1: 0, TIER_2: 0, TIER_3: 0, TIER_4: 0 };
  let goalkeeperCount = 0;
  let skillScore = 0;
  let recentLossScore = 0;
  let formScoreTotal = 0;
  let lowFormCount = 0;
  for (const member of members) {
    if (member.seedTier === "GOALKEEPER") goalkeeperCount += 1;
    else tierCounts[member.seedTier] += 1;
    skillScore += TIER_WEIGHT[member.seedTier];
    recentLossScore += 10_000 - member.formScore;
    formScoreTotal += member.formScore;
    if (member.lowForm) lowFormCount += 1;
  }
  return {
    index,
    members,
    memberCount: members.length,
    goalkeeperCount,
    skillScore,
    recentLossScore,
    formScoreTotal,
    lowFormCount,
    tierCounts,
  };
}

function spread(values: number[]) {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

export function balanceCost(teams: BalanceParticipant[][]) {
  const summaries = teams.map((members, index) => summarize(index + 1, members));
  const sizeGap = spread(summaries.map((team) => team.memberCount));
  const goalkeeperGap = spread(summaries.map((team) => team.goalkeeperCount));
  const skillGap = spread(summaries.map((team) => team.skillScore));
  const formAverageGap = spread(summaries.map((team) => team.memberCount
    ? Math.round(team.formScoreTotal / team.memberCount)
    : 0));
  const lowFormGap = spread(summaries.map((team) => team.lowFormCount));
  const tierGap = (["TIER_1", "TIER_2", "TIER_3", "TIER_4"] as const)
    .reduce((sum, tier) => sum + spread(summaries.map((team) => team.tierCounts[tier])), 0);
  return sizeGap * 1_000_000_000
    + goalkeeperGap * 100_000_000
    + skillGap * 1_000_000
    + tierGap * 100_000
    + lowFormGap * 20_000
    + formAverageGap;
}

export function generateBalancedTeams(
  participants: BalanceParticipant[],
  teamCount: number,
  randomKey: string,
) {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error("Số đội phải từ 2 trở lên.");
  if (participants.length < 10) throw new Error("Cần ít nhất 10 người tham gia để tạo đội.");
  if (teamCount > participants.length) throw new Error("Số đội không được vượt quá số người tham gia.");
  if (participants.some((participant) => !participant.seedTier)) throw new Error("Tất cả người tham gia phải có seed.");

  const random = seededRandom(randomKey);
  const maxSize = Math.ceil(participants.length / teamCount);
  const teams: BalanceParticipant[][] = Array.from({ length: teamCount }, () => []);

  for (const participant of participants.filter((row) => row.lockedTeamIndex)) {
    const index = (participant.lockedTeamIndex ?? 0) - 1;
    if (index < 0 || index >= teamCount) throw new Error("Đội đã khóa không còn hợp lệ với số đội mới.");
    teams[index].push(participant);
  }
  if (teams.some((team) => team.length > maxSize)) throw new Error("Số người bị khóa khiến quân số không thể cân bằng.");

  const unlocked = participants.filter((row) => !row.lockedTeamIndex);
  const goalkeepers = shuffled(unlocked.filter((row) => row.seedTier === "GOALKEEPER"), random);
  for (const goalkeeper of goalkeepers) {
    const candidates = teams
      .map((members, index) => ({ index, summary: summarize(index + 1, members), tie: random() }))
      .filter((candidate) => candidate.summary.memberCount < maxSize)
      .sort((a, b) => a.summary.goalkeeperCount - b.summary.goalkeeperCount
        || a.summary.memberCount - b.summary.memberCount
        || a.tie - b.tie);
    teams[candidates[0].index].push(goalkeeper);
  }

  const outfield = (["TIER_1", "TIER_2", "TIER_3", "TIER_4"] as const)
    .flatMap((tier) => shuffled(unlocked.filter((row) => row.seedTier === tier), random));

  for (const participant of outfield) {
    const candidates = teams
      .map((members, index) => {
        if (members.length >= maxSize) return null;
        const proposal = teams.map((team, teamIndex) => teamIndex === index ? [...team, participant] : team);
        return { index, cost: balanceCost(proposal), tie: random() };
      })
      .filter((candidate): candidate is { index: number; cost: number; tie: number } => candidate !== null)
      .sort((a, b) => a.cost - b.cost || a.tie - b.tie);
    teams[candidates[0].index].push(participant);
  }

  let currentCost = balanceCost(teams);
  for (let iteration = 0; iteration < 300; iteration += 1) {
    let best: { firstTeam: number; firstMember: number; secondTeam: number; secondMember: number; cost: number } | null = null;
    for (let firstTeam = 0; firstTeam < teams.length; firstTeam += 1) {
      for (let secondTeam = firstTeam + 1; secondTeam < teams.length; secondTeam += 1) {
        for (let firstMember = 0; firstMember < teams[firstTeam].length; firstMember += 1) {
          if (teams[firstTeam][firstMember].lockedTeamIndex) continue;
          for (let secondMember = 0; secondMember < teams[secondTeam].length; secondMember += 1) {
            if (teams[secondTeam][secondMember].lockedTeamIndex) continue;
            const firstIsGoalkeeper = teams[firstTeam][firstMember].seedTier === "GOALKEEPER";
            const secondIsGoalkeeper = teams[secondTeam][secondMember].seedTier === "GOALKEEPER";
            if (firstIsGoalkeeper !== secondIsGoalkeeper) continue;
            const proposal = teams.map((team) => [...team]);
            [proposal[firstTeam][firstMember], proposal[secondTeam][secondMember]] =
              [proposal[secondTeam][secondMember], proposal[firstTeam][firstMember]];
            const cost = balanceCost(proposal);
            if (cost < currentCost && (!best || cost < best.cost)) {
              best = { firstTeam, firstMember, secondTeam, secondMember, cost };
            }
          }
        }
      }
    }
    if (!best) break;
    const move = best;
    [teams[move.firstTeam][move.firstMember], teams[move.secondTeam][move.secondMember]] =
      [teams[move.secondTeam][move.secondMember], teams[move.firstTeam][move.firstMember]];
    currentCost = move.cost;
  }

  const summaries = teams.map((members, index) => summarize(index + 1, members));
  if (spread(summaries.map((team) => team.memberCount)) > 1) {
    throw new Error("Các cầu thủ đang khóa khiến quân số không thể chia đều. Hãy mở khóa và thử lại.");
  }
  if (spread(summaries.map((team) => team.goalkeeperCount)) > 1) {
    throw new Error("Các thủ môn đang khóa khiến vị trí thủ môn không thể chia đều. Hãy mở khóa và thử lại.");
  }

  return {
    teams: summaries,
    cost: currentCost,
  };
}
