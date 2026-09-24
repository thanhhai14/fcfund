import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  activityLogs,
  matches,
  matchParticipants,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberCharges,
  memberMatchStats,
  members,
} from "../src/db/schema";
import { FORM_SCORE_LOW_THRESHOLD, FORM_SCORE_MIN_SAMPLE } from "../src/lib/form-score";
import { isActiveSeedTier, SEED_WEIGHT } from "../src/lib/seed-tier";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const apply = process.argv.includes("--apply");
const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client);

const targets = [
  {
    matchId: "1b93e5bf-d56b-496a-98c1-0744dff4f6b1",
    memberId: "a55a6985-89f9-4878-af76-c02d70b1a266",
    expectedName: "Huỳnh Tú",
  },
  {
    matchId: "c47fd1e1-7fdf-4b5e-8f1a-5b84852858a0",
    memberId: "21e896db-dcfa-42cb-84e4-e80087961b74",
    expectedName: "Tâm Huỳnh",
  },
  {
    matchId: "c47fd1e1-7fdf-4b5e-8f1a-5b84852858a0",
    memberId: "bf22fdf8-226d-4cda-836d-7703f1b99f6f",
    expectedName: "Khánh Hòa",
  },
] as const;

async function inspectTarget(target: (typeof targets)[number]) {
  const [match] = await db.select({
    id: matches.id,
    clubId: matches.clubId,
    playedOn: matches.playedOn,
  }).from(matches).where(eq(matches.id, target.matchId)).limit(1);
  if (!match) throw new Error(`Không tìm thấy Match ${target.matchId}.`);

  const [member] = await db.select({ id: members.id, fullName: members.fullName })
    .from(members)
    .where(eq(members.id, target.memberId))
    .limit(1);
  if (!member) throw new Error(`Không tìm thấy member ${target.memberId}.`);

  const [participant] = await db.select({ id: matchParticipants.id })
    .from(matchParticipants)
    .where(and(
      eq(matchParticipants.matchId, target.matchId),
      eq(matchParticipants.memberId, target.memberId),
    ))
    .limit(1);

  const [confirmed] = await db.select({
    id: matchTeamVersions.id,
    version: matchTeamVersions.version,
  }).from(matchTeamVersions).where(and(
    eq(matchTeamVersions.matchId, target.matchId),
    eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1);
  if (!confirmed) throw new Error(`Match ${target.matchId} không có CONFIRMED version.`);

  const [slot] = await db.select({
    id: matchTeamMembers.id,
    teamId: matchTeamMembers.teamId,
    participantId: matchTeamMembers.participantId,
    displayName: matchTeamMembers.displayNameSnapshot,
    assignedAsGoalkeeper: matchTeamMembers.assignedAsGoalkeeper,
    seedTier: matchTeamMembers.seedTierSnapshot,
    recentMatchCount: matchTeamMembers.recentMatchCountSnapshot,
    formScore: matchTeamMembers.formScoreSnapshot,
    teamName: matchTeams.name,
    teamMemberCount: matchTeams.memberCount,
    teamGoalkeeperCount: matchTeams.goalkeeperCount,
    teamSkillScore: matchTeams.outfieldSkillScore,
    teamRecentLossScore: matchTeams.recentLossScore,
    teamFormScoreTotal: matchTeams.formScoreTotal,
    teamLowFormCount: matchTeams.lowFormCount,
  }).from(matchTeamMembers)
    .innerJoin(matchTeams, eq(matchTeamMembers.teamId, matchTeams.id))
    .where(and(
      eq(matchTeamMembers.versionId, confirmed.id),
      eq(matchTeamMembers.memberId, target.memberId),
    ))
    .limit(1);

  const activeCharges = await db.select({ id: memberCharges.id })
    .from(memberCharges)
    .where(and(
      eq(memberCharges.matchId, target.matchId),
      eq(memberCharges.memberId, target.memberId),
      isNull(memberCharges.deletedAt),
    ));

  const statRows = await db.select({ id: memberMatchStats.id })
    .from(memberMatchStats)
    .where(and(
      eq(memberMatchStats.matchId, target.matchId),
      eq(memberMatchStats.memberId, target.memberId),
    ));

  return { match, member, participant, confirmed, slot, activeCharges, statRows };
}

async function applyTarget(target: (typeof targets)[number]) {
  const state = await inspectTarget(target);

  if (state.participant) {
    throw new Error(
      `${state.member.fullName}: vẫn còn trong matchParticipants; không còn đúng mẫu lỗi lineup-only nên script dừng.`,
    );
  }
  if (!state.slot) {
    console.log(`SKIP ${state.member.fullName}: không còn trong confirmed lineup.`);
    return;
  }
  if (state.activeCharges.length) {
    throw new Error(
      `${state.member.fullName}: còn ${state.activeCharges.length} active charge(s). Script không đụng khoản thu; cần quyết định nghiệp vụ trước.`,
    );
  }

  const seedContribution = isActiveSeedTier(state.slot.seedTier)
    ? SEED_WEIGHT[state.slot.seedTier] * (state.slot.assignedAsGoalkeeper ? 0.1 : 1)
    : 0;
  const formFactor = state.slot.assignedAsGoalkeeper ? 0.15 : 1;
  const lossContribution = (10_000 - state.slot.formScore) * formFactor;
  const formContribution = state.slot.formScore * formFactor;
  const lowFormContribution = !state.slot.assignedAsGoalkeeper
    && state.slot.recentMatchCount >= FORM_SCORE_MIN_SAMPLE
    && state.slot.formScore < FORM_SCORE_LOW_THRESHOLD
    ? 1
    : 0;

  console.log(
    `${apply ? "APPLY" : "DRY-RUN"}: ${state.member.fullName} | match ${state.match.playedOn} | confirmed v${state.confirmed.version} | ${state.slot.teamName} | stats=${state.statRows.length} | activeCharges=0`,
  );

  if (!apply) return;

  await db.transaction(async (tx) => {
    await tx.delete(matchTeamMembers).where(eq(matchTeamMembers.id, state.slot!.id));

    await tx.delete(memberMatchStats).where(and(
      eq(memberMatchStats.matchId, target.matchId),
      eq(memberMatchStats.memberId, target.memberId),
    ));

    await tx.update(matchTeams).set({
      memberCount: Math.max(0, state.slot!.teamMemberCount - 1),
      goalkeeperCount: Math.max(0, state.slot!.teamGoalkeeperCount - Number(state.slot!.assignedAsGoalkeeper)),
      outfieldSkillScore: Math.max(0, Math.round(state.slot!.teamSkillScore - seedContribution)),
      recentLossScore: Math.max(0, Math.round(state.slot!.teamRecentLossScore - lossContribution)),
      formScoreTotal: Math.max(0, Math.round(state.slot!.teamFormScoreTotal - formContribution)),
      lowFormCount: Math.max(0, state.slot!.teamLowFormCount - lowFormContribution),
    }).where(eq(matchTeams.id, state.slot!.teamId));

    await tx.insert(activityLogs).values({
      clubId: state.match.clubId,
      entityType: "match",
      entityId: target.matchId,
      action: "UPDATE",
      actorId: null,
      beforeData: {
        repair: "PARTICIPANT_LINEUP_MISMATCH",
        memberId: target.memberId,
        memberName: state.member.fullName,
        teamMemberId: state.slot!.id,
        teamId: state.slot!.teamId,
        teamName: state.slot!.teamName,
        statCount: state.statRows.length,
      },
      afterData: {
        removedStaleLineupMember: true,
        removedStats: state.statRows.length,
        chargesChanged: false,
      },
      message: `Repair lịch sử: loại ${state.member.fullName} khỏi confirmed lineup ${state.slot!.teamName}; không thay đổi khoản thu`,
    });
  });
}

async function main() {
  console.log(apply
    ? "Applying known Match lifecycle repairs. memberCharges WILL NOT be modified."
    : "Dry-run known Match lifecycle repairs. Use --apply to write changes.");

  for (const target of targets) {
    if (target.expectedName) {
      // expectedName is documentation/safety context; actual DB name is printed below.
    }
    await applyTarget(target);
  }
}

main()
  .catch((error) => {
    console.error("Match lifecycle repair failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
