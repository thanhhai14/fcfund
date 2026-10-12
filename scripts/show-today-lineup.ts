import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { matches, matchTeamMembers, matchTeams, matchTeamVersions } from "../src/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client);

async function main() {
  const rows = await db.select({
    matchId: matches.id,
    playedOn: matches.playedOn,
    note: matches.note,
    versionId: matchTeamVersions.id,
    version: matchTeamVersions.version,
    metrics: matchTeamVersions.metrics,
  }).from(matches)
    .innerJoin(matchTeamVersions, and(
      eq(matchTeamVersions.matchId, matches.id),
      eq(matchTeamVersions.status, "CONFIRMED"),
    ))
    .where(and(
      eq(matches.playedOn, "2026-10-01"),
      isNull(matches.deletedAt),
      isNull(matches.hiddenAt),
    ));

  if (!rows.length) {
    console.log("Không tìm thấy đội hình CONFIRMED cho ngày 2026-10-01.");
    return;
  }

  for (const match of rows) {
    console.log(`MATCH ${match.playedOn} | ${match.note ?? "(không ghi chú)"} | version ${match.version}`);
    console.log(`METRICS ${JSON.stringify(match.metrics)}`);

    const lineup = await db.select({
      teamId: matchTeams.id,
      teamName: matchTeams.name,
      teamColor: matchTeams.color,
      teamIndex: matchTeams.teamIndex,
      memberName: matchTeamMembers.displayNameSnapshot,
      displayOrder: matchTeamMembers.displayOrder,
      goalkeeper: matchTeamMembers.assignedAsGoalkeeper,
      seedTier: matchTeamMembers.seedTierSnapshot,
      recentMatchCount: matchTeamMembers.recentMatchCountSnapshot,
      recentLossCount: matchTeamMembers.recentLossCountSnapshot,
      recentLossRate: matchTeamMembers.recentLossRateSnapshot,
      formScore: matchTeamMembers.formScoreSnapshot,
      formConfidence: matchTeamMembers.formConfidenceSnapshot,
    }).from(matchTeams)
      .innerJoin(matchTeamMembers, eq(matchTeamMembers.teamId, matchTeams.id))
      .where(eq(matchTeams.versionId, match.versionId))
      .orderBy(asc(matchTeams.teamIndex), asc(matchTeamMembers.displayOrder));

    let lastTeam = "";
    for (const row of lineup) {
      if (row.teamName !== lastTeam) {
        lastTeam = row.teamName;
        console.log(`\n[${row.teamName}] color=${row.teamColor ?? "-"}`);
      }
      const wins = Math.max(0, row.recentMatchCount - row.recentLossCount);
      const lossRate = row.recentLossRate == null ? "-" : `${Math.round(row.recentLossRate / 100)}%`;
      const form = Math.round(row.formScore / 100);
      console.log(`- ${row.memberName}${row.goalkeeper ? " (GK)" : ""} | seed=${row.seedTier} | recent=${wins}W-${row.recentLossCount}L/${row.recentMatchCount} | lossRate=${lossRate} | form=${form}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
