import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import postgres from "postgres";
import { calculateAdjustedFormScore } from "../src/lib/form-score";
import { generateBalancedTeams, type BalanceParticipant, type SeedTier } from "../src/lib/team-balancer";
import type { PlayerPosition, PlayerStrength } from "../src/lib/player-profile";

type TestMode = "auto" | "match";
type ClubRow = { id: string; name: string };
type MatchRow = { id: string; played_on: string; note: string | null; participant_count: number };
type MemberRow = {
  id: string;
  member_id: string | null;
  full_name: string;
  desired_positions: unknown;
  player_strength: string | null;
  latest_seed: string | null;
  goalkeeper_available: boolean | null;
};
type StatRow = { member_id: string; placement_score: number };
type FallbackSummary = { virtualMembers: number; seeds: number; positions: number; strengths: number };

const AUTO_CASES = [
  { label: "2 đội · quân số chuẩn", teamCount: 2, memberCount: 10 },
  { label: "3 đội · quân số chuẩn", teamCount: 3, memberCount: 15 },
  { label: "4 đội · quân số lẻ", teamCount: 4, memberCount: 19 },
] as const;
const SEEDS: SeedTier[] = ["TIER_1", "TIER_2", "TIER_3", "TIER_4", "TIER_5", "TIER_6", "TIER_7"];
const POSITION_FALLBACKS: PlayerPosition[][] = [
  ["DEFENDER"], ["MIDFIELDER"], ["FORWARD"], ["FORWARD"],
  ["DEFENDER", "MIDFIELDER"], ["MIDFIELDER", "FORWARD"],
];
const POSITION_LABELS: Record<PlayerPosition, string> = {
  GOALKEEPER: "TM", DEFENDER: "HV", MIDFIELDER: "TV", FORWARD: "TĐ",
};

function parseArgs() {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
    if (match) values.set(match[1], match[2] ?? "true");
  }
  const mode = values.get("mode");
  if (mode && mode !== "auto" && mode !== "match") throw new Error("--mode chỉ nhận auto hoặc match.");
  return { mode: mode as TestMode | undefined, match: values.get("match") };
}

function normalizeDate(value: string) {
  const vietnamese = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return vietnamese ? `${vietnamese[3]}-${vietnamese[2]}-${vietnamese[1]}` : value.trim();
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isSeed(value: string | null): value is SeedTier {
  return SEEDS.includes(value as SeedTier);
}

function parsedPositions(value: unknown) {
  const valid = new Set<PlayerPosition>(["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD"]);
  return Array.isArray(value)
    ? value.filter((item): item is PlayerPosition => typeof item === "string" && valid.has(item as PlayerPosition))
    : [];
}

function virtualMember(index: number): MemberRow {
  return {
    id: `virtual-${index + 1}`,
    member_id: null,
    full_name: `[TEST] Cầu thủ ${index + 1}`,
    desired_positions: POSITION_FALLBACKS[index % POSITION_FALLBACKS.length],
    player_strength: index % 2 ? "ATTACK" : "DEFENSE",
    latest_seed: null,
    goalkeeper_available: null,
  };
}

function buildParticipants(input: {
  source: MemberRow[];
  scores: Map<string, number>;
  memberCount: number;
  teamCount: number;
  mode: TestMode;
}) {
  const rows = [...input.source];
  const fallback: FallbackSummary = { virtualMembers: 0, seeds: 0, positions: 0, strengths: 0 };
  while (rows.length < input.memberCount) {
    rows.push(virtualMember(rows.length));
    fallback.virtualMembers += 1;
  }
  const selected = rows.slice(0, input.memberCount);
  const participants = selected.map((member, index): BalanceParticipant => {
    let seedTier: SeedTier;
    if (input.mode === "auto") {
      seedTier = isSeed(member.latest_seed) ? member.latest_seed : SEEDS[index % SEEDS.length];
      if (!isSeed(member.latest_seed)) fallback.seeds += 1;
    } else if (isSeed(member.latest_seed)) {
      seedTier = member.latest_seed;
    } else {
      seedTier = SEEDS[index % SEEDS.length];
      fallback.seeds += 1;
    }

    const storedPositions = parsedPositions(member.desired_positions);
    const desiredPositions = storedPositions.length ? storedPositions : POSITION_FALLBACKS[index % POSITION_FALLBACKS.length];
    if (!storedPositions.length) fallback.positions += 1;
    const playerStrength: PlayerStrength = member.player_strength === "ATTACK" || member.player_strength === "DEFENSE"
      ? member.player_strength
      : index % 2 ? "ATTACK" : "DEFENSE";
    if (member.player_strength !== "ATTACK" && member.player_strength !== "DEFENSE") fallback.strengths += 1;
    const formScore = member.member_id ? input.scores.get(member.member_id) ?? 5_000 : 5_000;
    return {
      participantId: `test-${input.teamCount}-${member.id}`,
      memberId: member.member_id,
      name: member.full_name,
      seedTier,
      goalkeeperAvailable: Boolean(member.goalkeeper_available) || index < input.teamCount || desiredPositions.includes("GOALKEEPER"),
      recentMatchCount: 0,
      recentLossCount: 0,
      recentLossRate: null,
      formScore,
      formConfidence: 0,
      inferredMatchCount: 0,
      lowForm: formScore < 4_000,
      desiredPositions,
      playerStrength,
    };
  });
  return { participants, fallback };
}

function validate(result: ReturnType<typeof generateBalancedTeams>, expectedMembers: number) {
  const ids = result.teams.flatMap((team) => team.members.map((member) => member.participantId));
  const sizes = result.teams.map((team) => team.memberCount);
  const goalkeepers = result.teams.map((team) => team.goalkeeperCount);
  if (ids.length !== expectedMembers) throw new Error(`Thiếu người: nhận ${ids.length}/${expectedMembers}.`);
  if (new Set(ids).size !== ids.length) throw new Error("Có cầu thủ bị xếp trùng đội.");
  if (Math.max(...sizes) - Math.min(...sizes) > 1) throw new Error("Quân số giữa các đội chênh quá 1.");
  if (goalkeepers.some((count) => count !== 1)) throw new Error("Mỗi đội phải có đúng một thủ môn.");
}

function printResult(label: string, result: ReturnType<typeof generateBalancedTeams>, fallback: FallbackSummary) {
  console.log(`\n${"═".repeat(78)}\n${label} · balance cost ${result.cost.toLocaleString("vi-VN")}\n${"═".repeat(78)}`);
  if (Object.values(fallback).some(Boolean)) {
    console.log(`Mô phỏng trong RAM: ${fallback.virtualMembers} người bổ sung · ${fallback.seeds} Seed · ${fallback.positions} vị trí · ${fallback.strengths} thế mạnh.`);
  } else console.log("Dùng hoàn toàn dữ liệu đã lưu của danh sách trận.");
  for (const team of result.teams) {
    const role = team.positionCounts;
    console.log(`\n${team.index}. ĐỘI ${String.fromCharCode(64 + team.index)} · ${team.memberCount} người · TM ${team.goalkeeperCount} · Seed ${team.skillScore} · Công/Thủ ${team.strengthCounts.ATTACK}/${team.strengthCounts.DEFENSE} · HV/TV/TĐ ${role.DEFENDER}/${role.MIDFIELDER}/${role.FORWARD}`);
    console.table(team.members.map((member, index) => ({
      STT: index + 1,
      "Thành viên": member.name,
      Seed: `${member.seedTier.replace("TIER_", "T")}${member.assignedAsGoalkeeper ? " · TM" : ""}`,
      "Vị trí": member.desiredPositions.map((position) => POSITION_LABELS[position]).join(", "),
      "Thế mạnh": member.playerStrength === "ATTACK" ? "Tấn công" : member.playerStrength === "DEFENSE" ? "Phòng thủ" : "Trung lập",
      "Phong độ": Math.round(member.formScore / 100),
    })));
  }
}

async function selectMode(args: ReturnType<typeof parseArgs>, readline: Interface | null): Promise<TestMode> {
  if (args.mode) return args.mode;
  if (!readline) throw new Error("Terminal không tương tác. Hãy truyền --mode=auto hoặc --mode=match.");
  console.log("\nChọn nguồn danh sách:\n  1. Chọn thành viên từ một trận có sẵn\n  2. Tự động tạo các danh sách test");
  const answer = (await readline.question("Lựa chọn [1-2]: ")).trim();
  if (answer === "1") return "match";
  if (answer === "2") return "auto";
  throw new Error("Lựa chọn không hợp lệ.");
}

async function selectMatch(matches: MatchRow[], requested: string | undefined, readline: Interface | null) {
  if (!matches.length) throw new Error("Database chưa có trận đấu nào.");
  if (requested) {
    const value = normalizeDate(requested);
    const found = matches.filter((match) => match.id === value || match.id.startsWith(value) || match.played_on === value);
    if (found.length === 1) return found[0];
    if (found.length > 1) throw new Error(`Có ${found.length} trận khớp ${requested}. Hãy dùng UUID hoặc tiền tố UUID dài hơn.`);
    throw new Error(`Không tìm thấy trận ${requested}.`);
  }
  if (!readline) throw new Error("Thiếu --match=<UUID|YYYY-MM-DD|DD/MM/YYYY>.");
  console.log("\nCác trận gần đây:");
  matches.forEach((match, index) => console.log(`  ${index + 1}. ${dateLabel(match.played_on)} · ${Number(match.participant_count)} người${match.note ? ` · ${match.note}` : ""}`));
  const selected = Number((await readline.question(`Chọn trận [1-${matches.length}]: `)).trim());
  if (!Number.isInteger(selected) || selected < 1 || selected > matches.length) throw new Error("Số thứ tự trận không hợp lệ.");
  return matches[selected - 1];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Thiếu DATABASE_URL. Hãy source file env trước khi chạy test.");
  const args = parseArgs();
  const readline = stdin.isTTY && stdout.isTTY ? createInterface({ input: stdin, output: stdout }) : null;
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout = '20s'");
      const [readOnly] = await tx<{ transaction_read_only: string }[]>`SHOW transaction_read_only`;
      if (readOnly?.transaction_read_only !== "on") throw new Error("Không thể kích hoạt transaction chỉ đọc. Đã hủy test.");

      const requestedClubId = process.env.TEST_CLUB_ID?.trim();
      const clubs = requestedClubId
        ? await tx<ClubRow[]>`SELECT id, name FROM clubs WHERE id = ${requestedClubId} LIMIT 1`
        : await tx<ClubRow[]>`SELECT id, name FROM clubs ORDER BY created_at LIMIT 1`;
      const club = clubs[0];
      if (!club) throw new Error(requestedClubId ? "Không tìm thấy TEST_CLUB_ID." : "Database chưa có club.");
      const mode = await selectMode(args, readline);
      const recentMatches = mode === "match" ? await tx<MatchRow[]>`
        SELECT match.id, match.played_on::text AS played_on, match.note, COUNT(participant.id)::integer AS participant_count
        FROM matches match
        LEFT JOIN match_participants participant ON participant.match_id = match.id
        WHERE match.club_id = ${club.id} AND match.deleted_at IS NULL
        GROUP BY match.id
        ORDER BY match.played_on DESC, match.created_at DESC
        LIMIT 20
      ` : [];
      const selectedMatch = mode === "match" ? await selectMatch(recentMatches, args.match, readline) : null;

      const members = selectedMatch ? await tx<MemberRow[]>`
        SELECT participant.id, participant.member_id,
          COALESCE(member.full_name, participant.guest_name, 'Khách') AS full_name,
          COALESCE(profile.desired_positions, '[]'::jsonb) AS desired_positions,
          profile.player_strength, participant.seed_tier AS latest_seed,
          participant.goalkeeper_available
        FROM match_participants participant
        LEFT JOIN members member ON member.id = participant.member_id
        LEFT JOIN member_profiles profile ON profile.member_id = participant.member_id
        WHERE participant.match_id = ${selectedMatch.id}
        ORDER BY COALESCE(member.full_name, participant.guest_name, 'Khách')
      ` : await tx<MemberRow[]>`
        SELECT member.id, member.id AS member_id, member.full_name,
          COALESCE(profile.desired_positions, '[]'::jsonb) AS desired_positions,
          profile.player_strength, latest.seed_tier AS latest_seed,
          NULL::boolean AS goalkeeper_available
        FROM members member
        LEFT JOIN member_profiles profile ON profile.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT participant.seed_tier
          FROM match_participants participant
          INNER JOIN matches match ON match.id = participant.match_id
          WHERE participant.member_id = member.id AND participant.seed_tier IS NOT NULL AND match.deleted_at IS NULL
          ORDER BY match.played_on DESC, participant.seed_evaluated_at DESC NULLS LAST
          LIMIT 1
        ) latest ON true
        WHERE member.club_id = ${club.id} AND member.status = 'ACTIVE'
        ORDER BY member.full_name
      `;
      if (selectedMatch && members.length < 10) throw new Error(`Trận ${dateLabel(selectedMatch.played_on)} chỉ có ${members.length} người; thuật toán cần ít nhất 10 người.`);

      const statRows = selectedMatch ? await tx<StatRow[]>`
        SELECT member_id, placement_score FROM (
          SELECT stat.member_id, stat.placement_score,
            ROW_NUMBER() OVER (PARTITION BY stat.member_id ORDER BY stat.played_on DESC, stat.created_at DESC) AS row_number
          FROM member_match_stats stat
          INNER JOIN matches match ON match.id = stat.match_id
          WHERE stat.club_id = ${club.id} AND stat.result <> 'UNRANKED'
            AND stat.played_on < ${selectedMatch.played_on} AND match.deleted_at IS NULL
        ) ranked WHERE row_number <= 10 ORDER BY member_id, row_number
      ` : await tx<StatRow[]>`
        SELECT member_id, placement_score FROM (
          SELECT stat.member_id, stat.placement_score,
            ROW_NUMBER() OVER (PARTITION BY stat.member_id ORDER BY stat.played_on DESC, stat.created_at DESC) AS row_number
          FROM member_match_stats stat
          INNER JOIN matches match ON match.id = stat.match_id
          WHERE stat.club_id = ${club.id} AND stat.result <> 'UNRANKED' AND match.deleted_at IS NULL
        ) ranked WHERE row_number <= 10 ORDER BY member_id, row_number
      `;
      const scoreRows = new Map<string, number[]>();
      for (const row of statRows) scoreRows.set(row.member_id, [...(scoreRows.get(row.member_id) ?? []), row.placement_score]);
      const scores = new Map([...scoreRows].map(([memberId, rows]) => [memberId, calculateAdjustedFormScore(rows).formScore]));

      console.log("\nFCFund · LIVE TEAM BALANCER TEST");
      console.log("Database: kết nối thành công (URL được ẩn)");
      console.log(`Club: ${club.name}`);
      console.log(`Chế độ PostgreSQL: READ ONLY = ${readOnly.transaction_read_only.toUpperCase()}`);
      console.log(selectedMatch
        ? `Nguồn: trận ${dateLabel(selectedMatch.played_on)} · ${members.length} người · phong độ tính trước ngày trận`
        : `Nguồn: tự động · ${members.length} thành viên hoạt động từ production`);
      console.log("Mọi bổ sung hoặc dữ liệu dự phòng chỉ tồn tại trong RAM.");

      const cases = selectedMatch
        ? [2, 3, 4].map((teamCount) => ({ label: `${teamCount} đội · danh sách trận ${dateLabel(selectedMatch.played_on)}`, teamCount, memberCount: members.length }))
        : AUTO_CASES;
      for (const testCase of cases) {
        const { participants, fallback } = buildParticipants({ source: members, scores, memberCount: testCase.memberCount, teamCount: testCase.teamCount, mode });
        const key = selectedMatch?.id ?? club.id;
        const result = generateBalancedTeams(participants, testCase.teamCount, `live-readonly-${key}-${testCase.teamCount}-${testCase.memberCount}`);
        validate(result, testCase.memberCount);
        printResult(`CASE ${testCase.label}`, result, fallback);
      }
      console.log(`\n✅ Hoàn tất ${cases.length} case. Không có dữ liệu nào được ghi vào database.\n`);
    });
  } finally {
    readline?.close();
    await sql.end({ timeout: 2 });
  }
}

main().catch((error) => {
  console.error("\n❌ Live team balancer test thất bại:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
