import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clubs, matches, matchTeams, matchTeamVersions } from "@/db/schema";

export async function getPublicLineupOverview(token: string) {
  const [match] = await db.select({
    id: matches.id,
    playedOn: matches.playedOn,
    clubId: matches.clubId,
    clubName: clubs.name,
    logoUrl: clubs.logoUrl,
    clubUpdatedAt: clubs.updatedAt,
  }).from(matches)
    .innerJoin(clubs, eq(matches.clubId, clubs.id))
    .where(and(
      eq(matches.publicLineupToken, token),
      eq(matches.publicLineupEnabled, true),
      isNull(matches.deletedAt),
    )).limit(1);
  if (!match) return null;

  const [confirmed] = await db.select({
    id: matchTeamVersions.id,
    version: matchTeamVersions.version,
  }).from(matchTeamVersions).where(and(
    eq(matchTeamVersions.matchId, match.id),
    eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1);
  if (!confirmed) return null;

  const teams = await db.select({
    id: matchTeams.id,
    name: matchTeams.name,
    color: matchTeams.color,
    memberCount: matchTeams.memberCount,
    teamIndex: matchTeams.teamIndex,
  }).from(matchTeams)
    .where(eq(matchTeams.versionId, confirmed.id))
    .orderBy(matchTeams.teamIndex);

  return {
    match,
    confirmed,
    teams,
    memberCount: teams.reduce((sum, team) => sum + team.memberCount, 0),
  };
}
