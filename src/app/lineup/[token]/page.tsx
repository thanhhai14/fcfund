/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  avatars,
  clubs,
  matches,
  matchTeamMembers,
  matchTeams,
  matchTeamVersions,
  memberProfiles,
} from "@/db/schema";
import { formatDate, initials } from "@/lib/format";
import { APP_NAME } from "@/lib/constants";
import { getPublicLineupOverview } from "@/lib/public-lineup";
import { getRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const overview = await getPublicLineupOverview(token);
  if (!overview) return { title: "Đội hình không khả dụng", robots: { index: false, follow: false } };

  const title = `Đội hình ngày ${formatDate(overview.match.playedOn)} · ${overview.match.clubName}`;
  const description = `${overview.teams.length} đội · ${overview.memberCount} cầu thủ · Xem đội hình thi đấu chính thức.`;
  const origin = await getRequestOrigin();
  const publicUrl = `${origin}/lineup/${encodeURIComponent(token)}`;
  const imageUrl = `${publicUrl}/opengraph-image`;

  return {
    title,
    description,
    applicationName: APP_NAME,
    alternates: { canonical: publicUrl },
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "vi_VN",
      siteName: APP_NAME,
      url: publicUrl,
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function PublicLineupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
  if (!match) notFound();

  const [confirmed] = await db.select().from(matchTeamVersions).where(and(
    eq(matchTeamVersions.matchId, match.id),
    eq(matchTeamVersions.status, "CONFIRMED"),
  )).limit(1);
  if (!confirmed) notFound();

  const teams = await db.select().from(matchTeams)
    .where(eq(matchTeams.versionId, confirmed.id))
    .orderBy(matchTeams.teamIndex);
  const members = await db.select({
    id: matchTeamMembers.id,
    teamId: matchTeamMembers.teamId,
    memberId: matchTeamMembers.memberId,
    name: matchTeamMembers.displayNameSnapshot,
    displayOrder: matchTeamMembers.displayOrder,
    shirtNumber: memberProfiles.shirtNumber,
    avatarUpdatedAt: avatars.updatedAt,
  }).from(matchTeamMembers)
    .leftJoin(memberProfiles, eq(matchTeamMembers.memberId, memberProfiles.memberId))
    .leftJoin(avatars, eq(matchTeamMembers.memberId, avatars.memberId))
    .where(eq(matchTeamMembers.versionId, confirmed.id))
    .orderBy(matchTeamMembers.displayOrder);

  return <main className="public-lineup-page">
    <header className="public-lineup-hero">
      <div className="public-lineup-club">
        <span className="public-lineup-logo">
          {match.logoUrl ? <img src={`/api/public-lineups/${token}/logo?v=${match.clubUpdatedAt.getTime()}`} alt={`Logo ${match.clubName}`} /> : initials(match.clubName)}
        </span>
        <div><small>Đội hình thi đấu</small><strong>{match.clubName}</strong></div>
      </div>
      <div className="public-lineup-date"><small>Ngày thi đấu</small><strong>{formatDate(match.playedOn)}</strong><span>Phiên bản {confirmed.version} · Đã xác nhận</span></div>
    </header>

    <section className="public-lineup-summary">
      <span><b>{members.length}</b> cầu thủ</span>
      <span><b>{teams.length}</b> đội thi đấu</span>
    </section>

    <section className="public-lineup-teams" aria-label="Danh sách đội thi đấu">
      {teams.map((team) => {
        const teamMembers = members.filter((member) => member.teamId === team.id);
        return <article className="public-lineup-team" style={{ borderTopColor: team.color ?? undefined }} key={team.id}>
          <header><span className="team-color" style={{ background: team.color ?? undefined }} /><div><h2>{team.name}</h2><small>{teamMembers.length} cầu thủ</small></div></header>
          <ol>
            {teamMembers.map((member) => <li key={member.id}>
              <span className="public-player-avatar">
                {member.memberId && member.avatarUpdatedAt
                  ? <img src={`/api/public-lineups/${token}/members/${member.memberId}/avatar?v=${member.avatarUpdatedAt.getTime()}`} alt={`Avatar ${member.name}`} />
                  : initials(member.name)}
              </span>
              <strong>{member.name}</strong>
              {member.shirtNumber !== null && <b className="public-shirt-number">#{member.shirtNumber}</b>}
            </li>)}
          </ol>
        </article>;
      })}
    </section>

    <footer className="public-lineup-footer"><strong>{match.clubName}</strong><span>Đội hình chính thức được chia sẻ từ Trai Làng FC</span></footer>
  </main>;
}
