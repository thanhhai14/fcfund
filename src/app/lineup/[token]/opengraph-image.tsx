import { get } from "@vercel/blob";
import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchTeamMembers } from "@/db/schema";
import { formatDate, initials } from "@/lib/format";
import { getPublicLineupOverview } from "@/lib/public-lineup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Đội hình thi đấu chính thức";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function getLogoDataUrl(blobUrl: string | null) {
  if (!blobUrl) return null;
  try {
    const access = blobUrl.includes(".private.blob.vercel-storage.com") ? "private" : "public";
    const result = await get(blobUrl, { access });
    if (!result) return null;
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    return `data:${result.blob.contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const overview = await getPublicLineupOverview(token);
  if (!overview) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", background: "#042f52", fontSize: 44, fontWeight: 800 }}>
        Đội hình không còn khả dụng
      </div>,
      { ...size, status: 404 },
    );
  }

  const [logoUrl, lineupMembers] = await Promise.all([
    getLogoDataUrl(overview.match.logoUrl),
    db.select({
      teamId: matchTeamMembers.teamId,
      name: matchTeamMembers.displayNameSnapshot,
      displayOrder: matchTeamMembers.displayOrder,
    }).from(matchTeamMembers)
      .where(eq(matchTeamMembers.versionId, overview.confirmed.id))
      .orderBy(matchTeamMembers.displayOrder),
  ]);
  const visibleTeams = overview.teams.slice(0, 4);
  const remainingTeams = overview.teams.length - visibleTeams.length;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", flexDirection: "column", padding: "54px 62px 48px", color: "#102c44", background: "#f7f4f5", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -160, right: -120, width: 520, height: 520, display: "flex", border: "84px solid rgba(207,63,112,.12)", borderRadius: 999 }} />
      <div style={{ position: "absolute", bottom: -210, left: -150, width: 460, height: 460, display: "flex", border: "72px solid rgba(4,47,82,.07)", borderRadius: 999 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 104, height: 104, display: "flex", alignItems: "center", justifyContent: "center", color: "#cf3f70", background: "#ffffff", fontSize: 28, fontWeight: 900, overflow: "hidden" }}>
            {logoUrl ? <img src={logoUrl} width="104" height="104" alt="" style={{ objectFit: "contain" }} /> : initials(overview.match.clubName)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 28 }}>
            <span style={{ color: "#cf3f70", fontSize: 20, fontWeight: 900, letterSpacing: 4 }}>ĐỘI HÌNH THI ĐẤU</span>
            <span style={{ maxWidth: 650, marginTop: 8, color: "#042f52", fontSize: 46, fontWeight: 900, lineHeight: 1.05, overflow: "hidden" }}>{overview.match.clubName}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", flexDirection: "column" }}>
          <span style={{ color: "#687887", fontSize: 17, fontWeight: 700 }}>NGÀY THI ĐẤU</span>
          <span style={{ marginTop: 7, color: "#cf3f70", fontSize: 35, fontWeight: 900 }}>{formatDate(overview.match.playedOn)}</span>
        </div>
      </div>

      <div style={{ width: "100%", height: 5, display: "flex", marginTop: 36, background: "#042f52" }} />

      <div style={{ display: "flex", alignItems: "stretch", gap: 16, marginTop: 28 }}>
        {visibleTeams.map((team) => {
          const teamMembers = lineupMembers.filter((member) => member.teamId === team.id);
          const visibleMembers = teamMembers.slice(0, 5);
          return <div key={team.id} style={{ minWidth: 0, height: 205, flex: 1, display: "flex", flexDirection: "column", padding: "16px 18px", background: "#ffffff", borderTop: `8px solid ${team.color || "#cf3f70"}`, boxShadow: "6px 6px 0 rgba(4,47,82,.09)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ maxWidth: 145, color: "#042f52", fontSize: 23, fontWeight: 900, overflow: "hidden" }}>{team.name}</span>
              <span style={{ color: "#687887", fontSize: 15, fontWeight: 800 }}>{team.memberCount} người</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
              {visibleMembers.map((member) => <div key={`${team.id}-${member.displayOrder}`} style={{ display: "flex", alignItems: "center", minWidth: 0, marginTop: 5 }}>
                <span style={{ width: 7, height: 7, display: "flex", flex: "0 0 7px", marginRight: 9, background: team.color || "#cf3f70" }} />
                <span style={{ maxWidth: 185, color: "#30495e", fontSize: 15, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{member.name}</span>
              </div>)}
              {teamMembers.length > visibleMembers.length && <span style={{ marginTop: 7, color: "#cf3f70", fontSize: 14, fontWeight: 900 }}>+{teamMembers.length - visibleMembers.length} cầu thủ</span>}
            </div>
          </div>;
        })}
        {remainingTeams > 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 22px", color: "#ffffff", background: "#042f52", fontSize: 22, fontWeight: 900 }}>+{remainingTeams} đội</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <span style={{ color: "#687887", fontSize: 18, fontWeight: 700 }}>Đội hình chính thức · Phiên bản {overview.confirmed.version}</span>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 18px", color: "#ffffff", background: "#cf3f70", borderBottom: "5px solid #042f52", fontSize: 20, fontWeight: 900 }}>
          {overview.teams.length} đội&nbsp;&nbsp;·&nbsp;&nbsp;{overview.memberCount} cầu thủ
        </div>
      </div>
    </div>,
    { ...size },
  );
}
