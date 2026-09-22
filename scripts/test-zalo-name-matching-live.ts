import postgres from "postgres";
import {
  normalizeVietnameseName,
  passesZaloNameMatchThreshold,
  zaloNameSimilarity,
  ZALO_NAME_MATCH_MIN_GAP,
  ZALO_NAME_MATCH_MIN_SCORE,
} from "../src/lib/zalo-name-matching";
import { getZaloPresetMemberCode } from "../src/lib/zalo-name-presets";

type ClubRow = {
  id: string;
  name: string;
};

type CandidateRow = {
  user_id: string;
  member_id: string;
  member_name: string;
  member_code: string;
};

type ActiveMemberRow = {
  member_id: string;
  member_name: string;
  member_code: string;
  user_id: string | null;
  user_active: boolean | null;
  zalo_identity_id: string | null;
};

const ZALO_NAMES = [
  "Phan Dũng",
  "Huy Duc",
  "Trần Anh Quốc",
  "Trọng Vinh",
  "Hòa Chung",
  "Huỳnh Tú",
  "Khoa Nguyen",
  "Le Cao Dang",
  "Nguyễn Mạnh Hùng",
  "Nguyễn Vũ",
  "Sỹ Tấn",
  "Tamhuynh",
  "Tường Nguyễn",
  "VO DINH LY",
  "Vương Nguyễn",
  "Hieu Art",
  "Phú Thành Tấm Nhựa Ốp Tường",
  "Thanh Bình",
  "Trần Văn Sĩ",
  "Trung Hiếu",
  "Trương Quốc Bảo",
  "Tuấn Decor Luxury",
  "Võ Thọ",
  "Vươngak",
  "Xuan Son",
  "Nguyễn Thanh Hải",
] as const;

function formatScore(value: number | undefined) {
  return value === undefined ? "-" : value.toFixed(3);
}

function eligibilityReason(member: ActiveMemberRow | undefined) {
  if (!member) return null;
  if (!member.user_id) return "member có tên trùng nhưng chưa có user";
  if (!member.user_active) return "user có tên trùng nhưng đang inactive";
  if (member.zalo_identity_id) return "user có tên trùng nhưng đã link Zalo";
  return null;
}

async function resolveClub(sql: ReturnType<typeof postgres>) {
  const configuredClubId = process.env.ZALO_CLUB_ID?.trim();

  if (configuredClubId) {
    const rows = await sql<ClubRow[]>`
      select id, name
      from clubs
      where id = ${configuredClubId}
      limit 1
    `;
    if (!rows.length) throw new Error("ZALO_CLUB_ID không tồn tại trong production DB.");
    return rows[0];
  }

  const rows = await sql<ClubRow[]>`
    select id, name
    from clubs
    order by created_at asc
    limit 2
  `;
  if (rows.length !== 1) {
    throw new Error(
      rows.length === 0
        ? "Production DB chưa có club."
        : "Production DB có nhiều club; cần source ZALO_CLUB_ID trước khi chạy test.",
    );
  }
  return rows[0];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Thiếu DATABASE_URL. Hãy source env production trước khi chạy.");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const club = await resolveClub(sql);

    const candidates = await sql<CandidateRow[]>`
      select
        u.id as user_id,
        m.id as member_id,
        m.full_name as member_name,
        m.code as member_code
      from users u
      inner join members m on m.id = u.member_id
      left join auth_identities ai
        on ai.user_id = u.id
       and ai.provider = 'ZALO'
      where u.club_id = ${club.id}
        and u.is_active = true
        and m.status = 'ACTIVE'
        and ai.id is null
      order by m.full_name asc
    `;

    const activeMembers = await sql<ActiveMemberRow[]>`
      select
        m.id as member_id,
        m.full_name as member_name,
        m.code as member_code,
        u.id as user_id,
        u.is_active as user_active,
        ai.id as zalo_identity_id
      from members m
      left join users u on u.member_id = m.id
      left join auth_identities ai
        on ai.user_id = u.id
       and ai.provider = 'ZALO'
      where m.club_id = ${club.id}
        and m.status = 'ACTIVE'
      order by m.full_name asc
    `;

    console.log(`Club: ${club.name} (${club.id})`);
    console.log(`Active members: ${activeMembers.length}`);
    console.log(`Eligible Zalo candidates: ${candidates.length}`);
    console.log(
      `Threshold: score >= ${ZALO_NAME_MATCH_MIN_SCORE.toFixed(2)}, gap >= ${ZALO_NAME_MATCH_MIN_GAP.toFixed(2)}`,
    );
    console.log("");

    const results = ZALO_NAMES.map((zaloName) => {
      const presetMemberCode = getZaloPresetMemberCode(zaloName);
      const presetCandidate = presetMemberCode
        ? candidates.find((candidate) => candidate.member_code === presetMemberCode)
        : undefined;

      const ranked = candidates
        .map((candidate) => ({
          ...candidate,
          score: zaloNameSimilarity(zaloName, candidate.member_name),
        }))
        .sort((left, right) => right.score - left.score);

      const best = presetMemberCode
        ? presetCandidate
          ? { ...presetCandidate, score: 1 }
          : undefined
        : ranked[0];
      const second = presetMemberCode ? undefined : ranked[1];
      const matched = presetMemberCode
        ? Boolean(presetCandidate)
        : best
          ? passesZaloNameMatchThreshold(best.score, second?.score)
          : false;

      const normalizedZaloName = normalizeVietnameseName(zaloName);
      const exactActiveMember = activeMembers.find(
        (member) => normalizeVietnameseName(member.member_name) === normalizedZaloName,
      );

      return {
        zaloName,
        normalized: normalizedZaloName,
        matched,
        best,
        second,
        third: ranked[2],
        rankedTop3: ranked.slice(0, 3),
        gap: best && second ? best.score - second.score : undefined,
        presetMemberCode,
        eligibilityReason: presetMemberCode && !presetCandidate
          ? eligibilityReason(activeMembers.find((member) => member.member_code === presetMemberCode))
          : eligibilityReason(exactActiveMember),
      };
    });

    console.log("=== ACTIVE MEMBERS ===");
    for (const member of activeMembers) {
      const state = !member.user_id
        ? "NO_USER"
        : !member.user_active
          ? "USER_INACTIVE"
          : member.zalo_identity_id
            ? "ZALO_LINKED"
            : "ELIGIBLE";
      console.log(`${member.member_name} [${member.member_code}] | ${state}`);
    }

    console.log("");
    console.log("=== SUMMARY ===");
    for (const result of results) {
      const decision = result.matched ? "MATCH" : "PENDING";
      const bestLabel = result.best
        ? `${result.best.member_name} [${result.best.member_code}]`
        : "-";
      const presetLabel = result.presetMemberCode ? ` | PRESET:${result.presetMemberCode}` : "";
      const reason = result.eligibilityReason ? ` | NOTE: ${result.eligibilityReason}` : "";
      console.log(
        `${decision.padEnd(7)} | ${result.zaloName.padEnd(30)} | best=${bestLabel.padEnd(36)} | score=${formatScore(result.best?.score)} | gap=${formatScore(result.gap)}${presetLabel}${reason}`,
      );
    }

    console.log("");
    console.log("=== TOP 3 CHO CÁC TÊN KHÔNG MATCH ===");
    for (const result of results.filter((item) => !item.matched)) {
      console.log(`\nZalo: ${result.zaloName} -> PENDING`);
      for (const [index, candidate] of result.rankedTop3.entries()) {
        console.log(
          `  #${index + 1} ${candidate.member_name} [${candidate.member_code}] score=${candidate.score.toFixed(3)}`,
        );
      }
      if (result.eligibilityReason) {
        console.log(`  NOTE: ${result.eligibilityReason}`);
      }
    }

    const matchedCount = results.filter((item) => item.matched).length;
    console.log("");
    console.log(`Kết quả: ${matchedCount}/${results.length} tên tự match; ${results.length - matchedCount} tên đi PENDING.`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
