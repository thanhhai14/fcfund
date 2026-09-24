import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, matchTeamVersions } from "@/db/schema";
import { deriveMatchLifecycle } from "@/lib/match-lifecycle-core";

export {
  canCancelMatch,
  canCancelMatchResult,
  canCreateTeamVersion,
  canEditMatchRoster,
  canRecordMatchResult,
  canReplaceOrAddConfirmedPlayer,
  deriveMatchLifecycle,
  getMatchResultChargeTypeId,
  hasRecordedMatchResult,
  isMatchRsvpClosed,
} from "@/lib/match-lifecycle-core";
export type {
  MatchLifecycle,
  MatchLifecycleContext,
  TeamVersionLifecycleRow,
} from "@/lib/match-lifecycle-core";

export async function getMatchLifecycle(matchId: string, clubId: string) {
  const [match] = await db
    .select({ id: matches.id, deletedAt: matches.deletedAt })
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.clubId, clubId)))
    .limit(1);

  if (!match) return null;

  const versions = await db
    .select({
      id: matchTeamVersions.id,
      status: matchTeamVersions.status,
      randomKey: matchTeamVersions.randomKey,
      initialDrawSnapshot: matchTeamVersions.initialDrawSnapshot,
      metrics: matchTeamVersions.metrics,
    })
    .from(matchTeamVersions)
    .where(eq(matchTeamVersions.matchId, matchId));

  return deriveMatchLifecycle({ deletedAt: match.deletedAt, versions });
}
