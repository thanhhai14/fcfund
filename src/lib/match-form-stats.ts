import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { matches, matchParticipants, memberCharges, memberMatchStats } from "@/db/schema";
import { calculateAdjustedFormScore, FORM_SCORE_NEUTRAL, isLowForm } from "@/lib/form-score";
export { FORM_SCORE_LOW_THRESHOLD, FORM_SCORE_MIN_SAMPLE } from "@/lib/form-score";

export type MatchFormStat = {
  matchCount: number;
  lossCount: number;
  winCount: number;
  lossRate: number | null;
  formScore: number;
  formConfidence: number;
  inferredMatchCount: number;
  lowForm: boolean;
};

export type MemberCareerStats = {
  matchCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
};

type FormEvent = {
  matchId: string;
  playedOn: string;
  createdAt: Date;
  score: number;
  result: "WIN" | "LOSS";
  inferred: boolean;
};

function emptyFormStat(): MatchFormStat {
  return {
    matchCount: 0,
    lossCount: 0,
    winCount: 0,
    lossRate: null,
    formScore: FORM_SCORE_NEUTRAL,
    formConfidence: 0,
    inferredMatchCount: 0,
    lowForm: false,
  };
}

function calculateFormStat(events: FormEvent[], lookbackMatches: number): MatchFormStat {
  const selected = [...events]
    .sort((first, second) => second.playedOn.localeCompare(first.playedOn)
      || second.createdAt.getTime() - first.createdAt.getTime()
      || second.matchId.localeCompare(first.matchId))
    .slice(0, lookbackMatches);
  if (!selected.length) return emptyFormStat();

  const winCount = selected.filter((event) => event.result === "WIN").length;
  const lossCount = selected.length - winCount;
  const { formScore, formConfidence } = calculateAdjustedFormScore(selected.map((event) => event.score));

  return {
    matchCount: selected.length,
    lossCount,
    winCount,
    lossRate: Math.round((lossCount / selected.length) * 10_000),
    formScore,
    formConfidence,
    inferredMatchCount: selected.filter((event) => event.inferred).length,
    lowForm: isLowForm(selected.length, formScore),
  };
}

export async function getMemberCareerStats(input: { clubId: string; memberId: string }): Promise<MemberCareerStats> {
  const rows = await db.select({ result: memberMatchStats.result })
    .from(memberMatchStats)
    .innerJoin(matches, eq(memberMatchStats.matchId, matches.id))
    .where(and(
      eq(memberMatchStats.clubId, input.clubId),
      eq(memberMatchStats.memberId, input.memberId),
      isNull(matches.deletedAt),
    ));
  const winCount = rows.filter((row) => row.result === "WIN").length;
  const lossCount = rows.filter((row) => row.result === "LOSS").length;
  const matchCount = winCount + lossCount;
  return {
    matchCount,
    winCount,
    lossCount,
    winRate: matchCount ? Math.round((winCount / matchCount) * 1_000) / 10 : null,
  };
}

export async function getMembersCareerStats(input: { clubId: string; memberIds: string[] }) {
  const result = new Map<string, MemberCareerStats>();
  for (const memberId of input.memberIds) result.set(memberId, { matchCount: 0, winCount: 0, lossCount: 0, winRate: null });
  if (!input.memberIds.length) return result;

  const rows = await db.select({
    memberId: memberMatchStats.memberId,
    result: memberMatchStats.result,
  }).from(memberMatchStats)
    .innerJoin(matches, eq(memberMatchStats.matchId, matches.id))
    .where(and(
      eq(memberMatchStats.clubId, input.clubId),
      inArray(memberMatchStats.memberId, input.memberIds),
      isNull(matches.deletedAt),
    ));

  for (const memberId of input.memberIds) {
    const memberRows = rows.filter((row) => row.memberId === memberId);
    const winCount = memberRows.filter((row) => row.result === "WIN").length;
    const lossCount = memberRows.filter((row) => row.result === "LOSS").length;
    const matchCount = winCount + lossCount;
    result.set(memberId, {
      matchCount,
      winCount,
      lossCount,
      winRate: matchCount ? Math.round((winCount / matchCount) * 1_000) / 10 : null,
    });
  }
  return result;
}

export async function getMatchFormStats(input: {
  clubId: string;
  playedOn: string;
  memberIds: string[];
  lookbackMatches: number;
}) {
  const result = new Map<string, MatchFormStat>();
  for (const memberId of input.memberIds) result.set(memberId, emptyFormStat());
  if (!input.memberIds.length) return result;

  const recordedRows = await db.select({
    memberId: memberMatchStats.memberId,
    matchId: memberMatchStats.matchId,
    playedOn: memberMatchStats.playedOn,
    score: memberMatchStats.placementScore,
    result: memberMatchStats.result,
    source: memberMatchStats.source,
    createdAt: matches.createdAt,
  })
    .from(memberMatchStats)
    .innerJoin(matches, eq(memberMatchStats.matchId, matches.id))
    .where(and(
      eq(memberMatchStats.clubId, input.clubId),
      inArray(memberMatchStats.memberId, input.memberIds),
      lt(memberMatchStats.playedOn, input.playedOn),
      isNull(matches.deletedAt),
    ))
    .orderBy(desc(memberMatchStats.playedOn), desc(matches.createdAt));

  const eventsByMember = new Map<string, FormEvent[]>();
  const recordedKeys = new Set<string>();
  for (const row of recordedRows) {
    if (row.result === "UNRANKED") continue;
    const key = `${row.memberId}|${row.matchId}`;
    recordedKeys.add(key);
    const events = eventsByMember.get(row.memberId) ?? [];
    events.push({
      matchId: row.matchId,
      playedOn: row.playedOn,
      createdAt: row.createdAt,
      score: row.score,
      result: row.result,
      inferred: row.source === "PENALTY_INFERRED",
    });
    eventsByMember.set(row.memberId, events);
  }

  // Legacy fallback: only matches without a recorded stat use the old penalty inference.
  const penaltyMatchRows = await db.selectDistinct({ matchId: memberCharges.matchId })
    .from(memberCharges)
    .innerJoin(matches, eq(memberCharges.matchId, matches.id))
    .where(and(
      eq(memberCharges.clubId, input.clubId),
      eq(memberCharges.isLossPenaltySnapshot, true),
      isNull(memberCharges.deletedAt),
      isNotNull(memberCharges.matchId),
      isNull(matches.deletedAt),
      lt(matches.playedOn, input.playedOn),
    ));
  const penaltyMatchIds = penaltyMatchRows.flatMap((row) => row.matchId ? [row.matchId] : []);
  if (penaltyMatchIds.length) {
    const [history, penaltyRows] = await Promise.all([
      db.select({
        memberId: matchParticipants.memberId,
        matchId: matches.id,
        playedOn: matches.playedOn,
        createdAt: matches.createdAt,
      })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .where(and(
          eq(matches.clubId, input.clubId),
          isNull(matches.deletedAt),
          inArray(matches.id, penaltyMatchIds),
          inArray(matchParticipants.memberId, input.memberIds),
        )),
      db.select({ memberId: memberCharges.memberId, matchId: memberCharges.matchId })
        .from(memberCharges)
        .where(and(
          eq(memberCharges.clubId, input.clubId),
          eq(memberCharges.isLossPenaltySnapshot, true),
          isNull(memberCharges.deletedAt),
          inArray(memberCharges.memberId, input.memberIds),
          inArray(memberCharges.matchId, penaltyMatchIds),
        )),
    ]);
    const lossKeys = new Set(penaltyRows.flatMap((row) => row.matchId ? [`${row.memberId}|${row.matchId}`] : []));
    for (const row of history) {
      if (!row.memberId) continue;
      const key = `${row.memberId}|${row.matchId}`;
      if (recordedKeys.has(key)) continue;
      const lost = lossKeys.has(key);
      const events = eventsByMember.get(row.memberId) ?? [];
      events.push({
        matchId: row.matchId,
        playedOn: row.playedOn,
        createdAt: row.createdAt,
        score: lost ? 0 : 10_000,
        result: lost ? "LOSS" : "WIN",
        inferred: true,
      });
      eventsByMember.set(row.memberId, events);
    }
  }

  for (const memberId of input.memberIds) {
    result.set(memberId, calculateFormStat(eventsByMember.get(memberId) ?? [], input.lookbackMatches));
  }
  return result;
}
