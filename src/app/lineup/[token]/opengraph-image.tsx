import { ImageResponse } from "next/og";
import { formatDate, initials } from "@/lib/format";
import { getPublicLineupOverview } from "@/lib/public-lineup";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Đội hình thi đấu chính thức";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

  const origin = await getRequestOrigin();
  const logoUrl = overview.match.logoUrl
    ? `${origin}/api/public-lineups/${encodeURIComponent(token)}/logo?v=${overview.match.clubUpdatedAt.getTime()}`
    : null;
  const visibleTeams = overview.teams.slice(0, 4);
  const remainingTeams = overview.teams.length - visibleTeams.length;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", flexDirection: "column", padding: "54px 62px 48px", color: "#102c44", background: "#f7f4f5", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -160, right: -120, width: 520, height: 520, display: "flex", border: "84px solid rgba(207,63,112,.12)", borderRadius: 999 }} />
      <div style={{ position: "absolute", bottom: -210, left: -150, width: 460, height: 460, display: "flex", border: "72px solid rgba(4,47,82,.07)", borderRadius: 999 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 104, height: 104, display: "flex", alignItems: "center", justifyContent: "center", color: "#cf3f70", background: "#ffffff", border: "4px solid #042f52", boxShadow: "9px 9px 0 #cf3f70", fontSize: 28, fontWeight: 900, overflow: "hidden" }}>
            {logoUrl ? <img src={logoUrl} width="96" height="96" alt="" style={{ objectFit: "cover" }} /> : initials(overview.match.clubName)}
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

      <div style={{ display: "flex", alignItems: "stretch", gap: 16, marginTop: 32 }}>
        {visibleTeams.map((team) => <div key={team.id} style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", padding: "22px 22px 20px", background: "#ffffff", borderTop: `8px solid ${team.color || "#cf3f70"}`, boxShadow: "6px 6px 0 rgba(4,47,82,.09)" }}>
          <span style={{ color: "#042f52", fontSize: 25, fontWeight: 900, overflow: "hidden" }}>{team.name}</span>
          <span style={{ marginTop: 8, color: "#687887", fontSize: 18, fontWeight: 700 }}>{team.memberCount} cầu thủ</span>
        </div>)}
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
