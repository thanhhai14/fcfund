import { randomUUID } from "node:crypto";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import postgres from "postgres";
import { calculateAdjustedFormScore, isLowForm } from "../src/lib/form-score";
import { generateBalancedTeams, type BalanceParticipant, type SeedTier } from "../src/lib/team-balancer";
import type { PlayerPosition, PlayerStrength } from "../src/lib/player-profile";
import { minimumParticipantsForTeams, plannedGoalkeeperCount } from "../src/lib/team-roster-rules";

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
type StatRow = {
  member_id: string;
  match_id: string;
  played_on: string;
  created_at: Date;
  placement_score: number;
  result: "WIN" | "LOSS";
  inferred: boolean;
};
type FormStat = {
  matchCount: number;
  lossCount: number;
  lossRate: number | null;
  formScore: number;
  formConfidence: number;
  inferredMatchCount: number;
  lowForm: boolean;
};

const AUTO_CASES = [
  { label: "2 đội · quân số chuẩn", teamCount: 2, memberCount: 10 },
  { label: "3 đội · quân số chuẩn", teamCount: 3, memberCount: 15 },
  { label: "4 đội · quân số lẻ", teamCount: 4, memberCount: 19 },
] as const;
const SEEDS: SeedTier[] = ["TIER_1", "TIER_2", "TIER_3", "TIER_4", "TIER_5", "TIER_6", "TIER_7"];
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
  return { mode: mode as TestMode | undefined, match: values.get("match"), randomKey: values.get("random-key") };
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

function buildParticipants(input: {
  source: MemberRow[];
  stats: Map<string, FormStat>;
  memberCount: number;
  teamCount: number;
  mode: TestMode;
}) {
  let selected: MemberRow[];
  if (input.mode === "match") {
    selected = [...input.source];
  } else {
    const eligible = input.source.filter((member) => isSeed(member.latest_seed));
    const goalkeepers = eligible.filter((member) => member.goalkeeper_available);
    if (goalkeepers.length < 2) {
      throw new Error(`Database chỉ có ${goalkeepers.length} thành viên có Seed hợp lệ và được đánh dấu có thể bắt gôn; cần ít nhất 2.`);
    }
    const goalkeeperCapacity = Math.max(2, input.memberCount - input.teamCount * 4);
    const selectedGoalkeepers = goalkeepers.slice(0, Math.min(input.teamCount, goalkeepers.length, goalkeeperCapacity));
    const selectedIds = new Set(selectedGoalkeepers.map((member) => member.id));
    selected = [...selectedGoalkeepers, ...eligible.filter((member) => !member.goalkeeper_available && !selectedIds.has(member.id))].slice(0, input.memberCount);
    if (selected.length < input.memberCount) {
      throw new Error(`Database chỉ có ${selected.length}/${input.memberCount} thành viên hoạt động với Seed Tier 1–7 đã lưu.`);
    }
  }

  const missingSeeds = selected.filter((member) => !isSeed(member.latest_seed));
  if (missingSeeds.length) {
    throw new Error(`Thiếu Seed Tier 1–7 trong DB: ${missingSeeds.map((member) => member.full_name).join(", ")}.`);
  }
  const goalkeeperCount = selected.filter((member) => member.goalkeeper_available).length;
  if (goalkeeperCount < 2) {
    throw new Error(`Trận chỉ có ${goalkeeperCount} người được đánh dấu có thể bắt gôn; cần ít nhất 2.`);
  }
  const minimumParticipants = minimumParticipantsForTeams(input.teamCount, goalkeeperCount);
  if (selected.length < minimumParticipants) {
    throw new Error(`${input.teamCount} đội với ${plannedGoalkeeperCount(input.teamCount, goalkeeperCount)} thủ môn cần ít nhất ${minimumParticipants} người; danh sách hiện có ${selected.length}.`);
  }

  const participants = selected.map((member): BalanceParticipant => {
    const seedTier = member.latest_seed as SeedTier;
    const desiredPositions = parsedPositions(member.desired_positions);
    const playerStrength: PlayerStrength | null = member.player_strength === "ATTACK" || member.player_strength === "DEFENSE"
      ? member.player_strength
      : null;
    const stat = member.member_id ? input.stats.get(member.member_id) : undefined;
    return {
      participantId: `test-${input.teamCount}-${member.id}`,
      memberId: member.member_id,
      name: member.full_name,
      seedTier,
      goalkeeperAvailable: Boolean(member.goalkeeper_available),
      recentMatchCount: stat?.matchCount ?? 0,
      recentLossCount: stat?.lossCount ?? 0,
      recentLossRate: stat?.lossRate ?? null,
      formScore: stat?.formScore ?? 5_000,
      formConfidence: stat?.formConfidence ?? 0,
      inferredMatchCount: stat?.inferredMatchCount ?? 0,
      lowForm: stat?.lowForm ?? false,
      desiredPositions,
      playerStrength,
    };
  });
  return participants;
}

function validate(result: ReturnType<typeof generateBalancedTeams>, expectedMembers: number) {
  const ids = result.teams.flatMap((team) => team.members.map((member) => member.participantId));
  const sizes = result.teams.map((team) => team.memberCount);
  const goalkeepers = result.teams.map((team) => team.goalkeeperCount);
  if (ids.length !== expectedMembers) throw new Error(`Thiếu người: nhận ${ids.length}/${expectedMembers}.`);
  if (new Set(ids).size !== ids.length) throw new Error("Có cầu thủ bị xếp trùng đội.");
  if (Math.max(...sizes) - Math.min(...sizes) > 1) throw new Error("Quân số giữa các đội chênh quá 1.");
  if (goalkeepers.some((count) => count > 1) || goalkeepers.reduce((sum, count) => sum + count, 0) < 2) throw new Error("Phân bổ thủ môn thật không hợp lệ.");
}

function printResult(label: string, result: ReturnType<typeof generateBalancedTeams>) {
  console.log(`\n${"═".repeat(78)}\n${label} · balance cost ${result.cost.toLocaleString("vi-VN")}\n${"═".repeat(78)}`);
  console.log("Dùng hoàn toàn dữ liệu đã lưu trong database; không bổ sung dữ liệu mô phỏng.");
  for (const team of result.teams) {
    const role = team.positionCounts;
    console.log(`\n${team.index}. ĐỘI ${String.fromCharCode(64 + team.index)} · ${team.memberCount} người · ${team.usesBorrowedGoalkeeper ? "TM mượn" : `TM ${team.goalkeeperCount}`} · Đội hình 5: Seed ${team.lineupSkillScore}, phong độ ${Math.round(team.lineupFormScore / 100)} · Toàn đội: Seed ${team.skillScore} · Công/Thủ ${team.strengthCounts.ATTACK}/${team.strengthCounts.DEFENSE} · HV/TV/TĐ ${role.DEFENDER}/${role.MIDFIELDER}/${role.FORWARD}`);
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
          latest.goalkeeper_available
        FROM members member
        LEFT JOIN member_profiles profile ON profile.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT participant.seed_tier, participant.goalkeeper_available
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

      const recordedRows = selectedMatch ? await tx<StatRow[]>`
        SELECT stat.member_id, stat.match_id, stat.played_on::text AS played_on,
          match.created_at, stat.placement_score, stat.result,
          (stat.source = 'PENALTY_INFERRED') AS inferred
        FROM member_match_stats stat
        INNER JOIN matches match ON match.id = stat.match_id
        WHERE stat.club_id = ${club.id} AND stat.result <> 'UNRANKED'
          AND stat.played_on < ${selectedMatch.played_on} AND match.deleted_at IS NULL
      ` : await tx<StatRow[]>`
        SELECT stat.member_id, stat.match_id, stat.played_on::text AS played_on,
          match.created_at, stat.placement_score, stat.result,
          (stat.source = 'PENALTY_INFERRED') AS inferred
        FROM member_match_stats stat
        INNER JOIN matches match ON match.id = stat.match_id
        WHERE stat.club_id = ${club.id} AND stat.result <> 'UNRANKED' AND match.deleted_at IS NULL
      `;
      const inferredRows = selectedMatch ? await tx<StatRow[]>`
        SELECT participant.member_id, match.id AS match_id, match.played_on::text AS played_on,
          match.created_at,
          CASE WHEN EXISTS (
            SELECT 1 FROM member_charges loss
            WHERE loss.match_id = match.id AND loss.member_id = participant.member_id
              AND loss.club_id = ${club.id} AND loss.is_loss_penalty_snapshot = true AND loss.deleted_at IS NULL
          ) THEN 0 ELSE 10000 END AS placement_score,
          CASE WHEN EXISTS (
            SELECT 1 FROM member_charges loss
            WHERE loss.match_id = match.id AND loss.member_id = participant.member_id
              AND loss.club_id = ${club.id} AND loss.is_loss_penalty_snapshot = true AND loss.deleted_at IS NULL
          ) THEN 'LOSS' ELSE 'WIN' END AS result,
          true AS inferred
        FROM match_participants participant
        INNER JOIN matches match ON match.id = participant.match_id
        WHERE match.club_id = ${club.id} AND match.deleted_at IS NULL
          AND match.played_on < ${selectedMatch.played_on} AND participant.member_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM member_charges penalty
            WHERE penalty.match_id = match.id AND penalty.club_id = ${club.id}
              AND penalty.is_loss_penalty_snapshot = true AND penalty.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM member_match_stats stat
            WHERE stat.match_id = match.id AND stat.member_id = participant.member_id AND stat.result <> 'UNRANKED'
          )
      ` : await tx<StatRow[]>`
        SELECT participant.member_id, match.id AS match_id, match.played_on::text AS played_on,
          match.created_at,
          CASE WHEN EXISTS (
            SELECT 1 FROM member_charges loss
            WHERE loss.match_id = match.id AND loss.member_id = participant.member_id
              AND loss.club_id = ${club.id} AND loss.is_loss_penalty_snapshot = true AND loss.deleted_at IS NULL
          ) THEN 0 ELSE 10000 END AS placement_score,
          CASE WHEN EXISTS (
            SELECT 1 FROM member_charges loss
            WHERE loss.match_id = match.id AND loss.member_id = participant.member_id
              AND loss.club_id = ${club.id} AND loss.is_loss_penalty_snapshot = true AND loss.deleted_at IS NULL
          ) THEN 'LOSS' ELSE 'WIN' END AS result,
          true AS inferred
        FROM match_participants participant
        INNER JOIN matches match ON match.id = participant.match_id
        WHERE match.club_id = ${club.id} AND match.deleted_at IS NULL AND participant.member_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM member_charges penalty
            WHERE penalty.match_id = match.id AND penalty.club_id = ${club.id}
              AND penalty.is_loss_penalty_snapshot = true AND penalty.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM member_match_stats stat
            WHERE stat.match_id = match.id AND stat.member_id = participant.member_id AND stat.result <> 'UNRANKED'
          )
      `;
      const eventsByMember = new Map<string, StatRow[]>();
      for (const row of [...recordedRows, ...inferredRows]) {
        eventsByMember.set(row.member_id, [...(eventsByMember.get(row.member_id) ?? []), row]);
      }
      const stats = new Map<string, FormStat>();
      for (const [memberId, events] of eventsByMember) {
        const selectedEvents = [...events].sort((first, second) => second.played_on.localeCompare(first.played_on)
          || second.created_at.getTime() - first.created_at.getTime()
          || second.match_id.localeCompare(first.match_id)).slice(0, 10);
        const lossCount = selectedEvents.filter((event) => event.result === "LOSS").length;
        const { formScore, formConfidence } = calculateAdjustedFormScore(selectedEvents.map((event) => event.placement_score));
        stats.set(memberId, {
          matchCount: selectedEvents.length,
          lossCount,
          lossRate: selectedEvents.length ? Math.round((lossCount / selectedEvents.length) * 10_000) : null,
          formScore,
          formConfidence,
          inferredMatchCount: selectedEvents.filter((event) => event.inferred).length,
          lowForm: isLowForm(selectedEvents.length, formScore),
        });
      }

      console.log("\nFCFund · LIVE TEAM BALANCER TEST");
      console.log("Database: kết nối thành công (URL được ẩn)");
      console.log(`Club: ${club.name}`);
      console.log(`Chế độ PostgreSQL: READ ONLY = ${readOnly.transaction_read_only.toUpperCase()}`);
      console.log(selectedMatch
        ? `Nguồn: trận ${dateLabel(selectedMatch.played_on)} · ${members.length} người · phong độ tính trước ngày trận`
        : `Nguồn: tự động · ${members.length} thành viên hoạt động từ production`);
      console.log("Nguồn kiểm thử chỉ sử dụng dữ liệu đã lưu trong DB; transaction không cho phép ghi.");
      const runRandomKey = args.randomKey ?? randomUUID();
      console.log(`Random key lượt test: ${runRandomKey}${args.randomKey ? " (được chỉ định)" : " (tự sinh)"}`);

      const cases = selectedMatch
        ? [2, 3, 4].map((teamCount) => ({ label: `${teamCount} đội · danh sách trận ${dateLabel(selectedMatch.played_on)}`, teamCount, memberCount: members.length }))
        : AUTO_CASES;
      let completedCases = 0;
      for (const testCase of cases) {
        try {
          const participants = buildParticipants({ source: members, stats, memberCount: testCase.memberCount, teamCount: testCase.teamCount, mode });
          const sourceKey = selectedMatch?.id ?? club.id;
          const result = generateBalancedTeams(participants, testCase.teamCount, `live-readonly-${runRandomKey}-${sourceKey}-${testCase.teamCount}-${testCase.memberCount}`);
          validate(result, participants.length);
          printResult(`CASE ${testCase.label}`, result);
          completedCases += 1;
        } catch (error) {
          console.log(`\n⏭ Bỏ qua CASE ${testCase.label}: ${error instanceof Error ? error.message : error}`);
        }
      }
      if (!completedCases) throw new Error("Không có case nào đủ dữ liệu thật để chạy.");
      console.log(`\n✅ Hoàn tất ${completedCases}/${cases.length} case đủ điều kiện. Không có dữ liệu nào được ghi vào database.\n`);
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
