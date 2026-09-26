import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { matches, memberMatchStats, members } from "../src/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client);

async function main() {
  const rows = await db.select({
    memberId: memberMatchStats.memberId,
    name: members.fullName,
    playedOn: memberMatchStats.playedOn,
    result: memberMatchStats.result,
    placement: memberMatchStats.placement,
    teamCount: memberMatchStats.teamCount,
    placementScore: memberMatchStats.placementScore,
  }).from(memberMatchStats)
    .innerJoin(members, eq(memberMatchStats.memberId, members.id))
    .innerJoin(matches, eq(memberMatchStats.matchId, matches.id))
    .where(and(
      gte(memberMatchStats.playedOn, "2026-09-01"),
      lt(memberMatchStats.playedOn, "2026-10-01"),
      isNull(matches.deletedAt),
      isNull(matches.hiddenAt),
    ))
    .orderBy(asc(memberMatchStats.playedOn), asc(members.fullName));

  const byMember = new Map<string, {
    name: string;
    matches: number;
    wins: number;
    losses: number;
    totalPlacementScore: number;
    placements: Record<number, number>;
  }>();

  for (const row of rows) {
    if (row.result === "UNRANKED") continue;
    const current = byMember.get(row.memberId) ?? {
      name: row.name,
      matches: 0,
      wins: 0,
      losses: 0,
      totalPlacementScore: 0,
      placements: {},
    };
    current.matches += 1;
    if (row.result === "WIN") current.wins += 1;
    if (row.result === "LOSS") current.losses += 1;
    current.totalPlacementScore += row.placementScore;
    if (row.placement != null) current.placements[row.placement] = (current.placements[row.placement] ?? 0) + 1;
    byMember.set(row.memberId, current);
  }

  const ranking = [...byMember.values()]
    .map((m) => ({
      ...m,
      winRate: m.matches ? Math.round((m.wins / m.matches) * 1000) / 10 : null,
      avgPlacementScore: m.matches ? Math.round(m.totalPlacementScore / m.matches) : 0,
    }))
    .sort((a, b) =>
      b.totalPlacementScore - a.totalPlacementScore
      || b.matches - a.matches
      || b.wins - a.wins
      || a.losses - b.losses
      || a.name.localeCompare(b.name, "vi")
    );

  console.log(JSON.stringify(ranking, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
