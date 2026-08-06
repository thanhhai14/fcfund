import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, matchParticipants, matchTeamVersions, memberCharges } from "@/db/schema";

export type MatchFormStat = {
  matchCount: number;
  lossCount: number;
  winCount: number;
  lossRate: number | null;
};

export async function getMatchFormStats(input: {
  clubId: string;
  playedOn: string;
  memberIds: string[];
  lookbackMatches: number;
}) {
  const result = new Map<string, MatchFormStat>();
  for (const memberId of input.memberIds) {
    result.set(memberId, { matchCount: 0, lossCount: 0, winCount: 0, lossRate: null });
  }
  if (!input.memberIds.length) return result;

  const [penaltyMatchRows, resultMatchRows] = await Promise.all([
    db.selectDistinct({ matchId: memberCharges.matchId })
      .from(memberCharges)
      .where(and(
        eq(memberCharges.clubId, input.clubId),
        eq(memberCharges.isLossPenaltySnapshot, true),
        isNull(memberCharges.deletedAt),
        isNotNull(memberCharges.matchId),
      )),
    db.select({ matchId: matchTeamVersions.matchId })
      .from(matchTeamVersions)
      .innerJoin(matches, eq(matchTeamVersions.matchId, matches.id))
      .where(and(
        eq(matches.clubId, input.clubId),
        isNull(matches.deletedAt),
        eq(matchTeamVersions.status, "CONFIRMED"),
        sql`${matchTeamVersions.metrics} ? 'placements'`,
      )),
  ]);
  const completedMatchIds = [...new Set([
    ...penaltyMatchRows.flatMap((row) => row.matchId ? [row.matchId] : []),
    ...resultMatchRows.map((row) => row.matchId),
  ])];
  if (!completedMatchIds.length) return result;

  const history = await db.select({
    memberId: matchParticipants.memberId,
    matchId: matches.id,
    playedOn: matches.playedOn,
  })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(and(
      eq(matches.clubId, input.clubId),
      isNull(matches.deletedAt),
      lt(matches.playedOn, input.playedOn),
      inArray(matches.id, completedMatchIds),
      inArray(matchParticipants.memberId, input.memberIds),
    ))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));

  const recentByMember = new Map<string, string[]>();
  for (const row of history) {
    if (!row.memberId) continue;
    const rows = recentByMember.get(row.memberId) ?? [];
    if (!rows.includes(row.matchId) && rows.length < input.lookbackMatches) rows.push(row.matchId);
    recentByMember.set(row.memberId, rows);
  }

  const relevantMatchIds = [...new Set([...recentByMember.values()].flat())];
  const penaltyRows = relevantMatchIds.length ? await db.select({
    memberId: memberCharges.memberId,
    matchId: memberCharges.matchId,
  })
    .from(memberCharges)
    .where(and(
      eq(memberCharges.clubId, input.clubId),
      eq(memberCharges.isLossPenaltySnapshot, true),
      isNull(memberCharges.deletedAt),
      inArray(memberCharges.memberId, input.memberIds),
      inArray(memberCharges.matchId, relevantMatchIds),
    )) : [];
  const lossKeys = new Set(penaltyRows.flatMap((row) => row.matchId ? [`${row.memberId}|${row.matchId}`] : []));

  for (const memberId of input.memberIds) {
    const matchIds = recentByMember.get(memberId) ?? [];
    const lossCount = matchIds.filter((matchId) => lossKeys.has(`${memberId}|${matchId}`)).length;
    result.set(memberId, {
      matchCount: matchIds.length,
      lossCount,
      winCount: matchIds.length - lossCount,
      lossRate: matchIds.length ? Math.round((lossCount / matchIds.length) * 10_000) : null,
    });
  }
  return result;
}
