/**
 * Run from project root:
 * ./node_modules/.bin/tsx --env-file=.env.local scripts/report-trio-teammates.ts
 * Optional: --from=2026-08-01 --to=2026-09-30 --as-of=2026-10-01
 * Counts match records (football sessions), not individual games within a session.
 */
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { matches, members, matchTeamVersions, matchTeamMembers, matchTeams } from "../src/db/schema";
import { hasRecordedMatchResult } from "../src/lib/match-lifecycle-core";

const names = ["Võ Thọ", "Đức Huy", "Anh Vũ"];
const args = process.argv.slice(2);
const allowed = new Set(["from", "to", "as-of"]);
for (const arg of args) {
  if (!/^--[^=]+=.+$/.test(arg) || !allowed.has(arg.slice(2).split("=")[0])) {
    throw new Error("Tham số không hợp lệ. Dùng --from=YYYY-MM-DD --to=YYYY-MM-DD --as-of=YYYY-MM-DD");
  }
}
function option(key: string, fallback: string) {
  const values = args.filter((arg) => arg.startsWith("--" + key + "="));
  if (values.length > 1) throw new Error("Tham số bị lặp: " + key);
  const value = values[0]?.split("=")[1] ?? fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error("Ngày không hợp lệ: " + key);
  }
  return value;
}
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const from = option("from", "2026-08-01");
const to = option("to", "2026-09-30");
const asOf = option("as-of", today);
if (from > to || to > asOf) throw new Error("Cần from <= to <= as-of.");
const normalize = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL. Chạy bằng --env-file=.env.local.");

const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
const db = drizzle(client);

async function main() {
  // Enforce read-only access and use a consistent snapshot across all SELECTs.
  const data = await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    const people = await tx.select({ id: members.id, name: members.fullName }).from(members);
    const selected = names.map((name) => {
      const key = normalize(name);
      const exact = people.filter((p) => normalize(p.name) === key);
      const candidates = exact.length ? exact : people.filter((p) => normalize(p.name).endsWith(" " + key));
      if (candidates.length !== 1) {
        throw new Error("Không xác định duy nhất thành viên " + name + ". Ứng viên: " +
          (candidates.map((p) => p.name + " [" + p.id + "]").join(", ") || "không có"));
      }
      return candidates[0];
    });
    if (new Set(selected.map((p) => p.id)).size !== 3) throw new Error("Ba tên phải thuộc ba thành viên khác nhau.");
    const rows = await tx.select({
      id: matches.id, date: matches.playedOn,
      versionId: matchTeamVersions.id, version: matchTeamVersions.version,
      metrics: matchTeamVersions.metrics,
    }).from(matches).innerJoin(matchTeamVersions, eq(matchTeamVersions.matchId, matches.id))
      .where(and(isNull(matches.deletedAt), gte(matches.playedOn, from),
        lte(matches.playedOn, asOf), eq(matchTeamVersions.status, "CONFIRMED")));
    const recorded = rows.filter((row) => hasRecordedMatchResult(row.metrics));
    const seen = new Set<string>();
    for (const row of recorded) {
      if (seen.has(row.id)) throw new Error("Trận có nhiều phiên bản CONFIRMED chứa kết quả: " + row.id);
      seen.add(row.id);
    }
    const lineup = await tx.select({
      versionId: matchTeamMembers.versionId, memberId: matchTeamMembers.memberId,
      teamId: matchTeamMembers.teamId, team: matchTeams.name,
    }).from(matchTeamMembers)
      .innerJoin(matchTeams, eq(matchTeamMembers.teamId, matchTeams.id))
      .innerJoin(matchTeamVersions, eq(matchTeamMembers.versionId, matchTeamVersions.id))
      .innerJoin(matches, eq(matchTeamVersions.matchId, matches.id))
      .where(and(isNull(matches.deletedAt), gte(matches.playedOn, from),
        lte(matches.playedOn, asOf), eq(matchTeamVersions.status, "CONFIRMED")));
    return { selected, recorded, lineup };
  });
  const completed = data.recorded.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const interval = completed.filter((row) => row.date <= to);
  const pairHits = interval.flatMap((match) => {
    const teams = new Map<string, { name: string; ids: Set<string> }>();
    for (const player of data.lineup.filter((p) => p.versionId === match.versionId)) {
      const team = teams.get(player.teamId) ?? { name: player.team, ids: new Set<string>() };
      if (player.memberId) team.ids.add(player.memberId);
      teams.set(player.teamId, team);
    }
    return [...teams.values()].flatMap((team) => {
      const people = data.selected.filter((p) => team.ids.has(p.id));
      return people.length >= 2
        ? [{ date: match.date, matchId: match.id, team: team.name, count: people.length,
             members: people.map((p) => p.name).join(", ") }]
        : [];
    });
  });
  console.log("Số trận có ít nhất 2 người cùng đội: " + new Set(pairHits.map((h) => h.matchId)).size);
  console.table(pairHits);
  console.log("Thống kê từng cặp (trận cả ba cùng đội tính cho cả ba cặp):");
  console.table(data.selected.flatMap((person, index) =>
    data.selected.slice(index + 1).map((other) => ({
      pair: person.name + " + " + other.name,
      matches: new Set(pairHits.filter((h) =>
        data.lineup.some((p) => p.versionId === data.recorded.find((m) => m.id === h.matchId)?.versionId &&
          p.team === h.team && p.memberId === person.id) &&
        data.lineup.some((p) => p.versionId === data.recorded.find((m) => m.id === h.matchId)?.versionId &&
          p.team === h.team && p.memberId === other.id)
      ).map((h) => h.matchId)).size,
    }))
  ));
  const together = interval.flatMap((match) => {
    const teams = new Map<string, { name: string; ids: Set<string> }>();
    for (const player of data.lineup.filter((p) => p.versionId === match.versionId)) {
      const team = teams.get(player.teamId) ?? { name: player.team, ids: new Set<string>() };
      if (player.memberId) team.ids.add(player.memberId);
      teams.set(player.teamId, team);
    }
    const found = [...teams.entries()].filter(([, team]) => data.selected.every((p) => team.ids.has(p.id)));
    if (found.length > 1) throw new Error("Ba thành viên xuất hiện cùng nhau trong nhiều đội: " + match.id);
    return found.map(([teamId, team]) => ({ date: match.date, matchId: match.id, team: team.name, teamId }));
  });
  console.log("Thành viên được xác định:");
  console.table(data.selected);
  console.log("Khoảng thống kê: " + from + " đến " + to + "; tính đến " + asOf + " (giờ Việt Nam).");
  console.log("Tổng trận có kết quả trong khoảng: " + interval.length);
  console.log("Số lần cả ba cùng một đội: " + together.length);
  console.table(together);
  console.log("Tổng trận có kết quả từ " + from + " đến " + asOf + ": " + completed.length);
  if (!together.length) {
    console.log("Không có mốc cùng đội trong khoảng để đếm trận sau đó.");
    return;
  }
  console.log("Đếm theo ngày của từng lần cùng đội:");
  console.table(together.map((hit) => ({
    date: hit.date, team: hit.team, matchId: hit.matchId,
    laterDates: completed.filter((m) => m.date > hit.date).length,
    fromDateInclusive: completed.filter((m) => m.date >= hit.date).length,
  })));
  const latest = together[together.length - 1];
  console.log("Lần gần nhất cùng đội: " + latest.date + " — " + latest.team + ".");
  console.log("Số trận có kết quả sau ngày này: " + completed.filter((m) => m.date > latest.date).length + ".");
  console.log("Số trận có kết quả tính cả ngày này: " + completed.filter((m) => m.date >= latest.date).length + ".");
  console.log("Nếu có nhiều trận cùng ngày, cột fromDateInclusive tính tất cả trận trong ngày đó.");
}

main().catch(() => {
  // Connection errors can contain credentials; never print raw database errors.
  console.error("Không hoàn tất báo cáo. Kiểm tra kết nối DB, schema, ngày và tên thành viên.");
  process.exitCode = 1;
}).finally(() => client.end({ timeout: 5 }));
