"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { MemberAvatar } from "./member-identity";
import { TeamCountField } from "./team-count-field";
import { playerPositionsLabel, playerStrengthLabel, type PlayerPosition, type PlayerStrength } from "@/lib/player-profile";
import { ACTIVE_SEED_TIERS, SEED_LABELS, type StoredSeedTier } from "@/lib/seed-tier";


export type TeamDrawData = {
  runId: string;
  teams: Array<{
    id: string;
    index: number;
    name: string;
    color: string;
    members: Array<{
      participantId: string;
      memberId: string | null;
      name: string;
      seedTier: StoredSeedTier;
      assignedAsGoalkeeper: boolean;
      isLocked: boolean;
    }>;
  }>;
};

type DrawResult = { ok: boolean; message: string; draw?: TeamDrawData };
type Participant = {
  participantId: string;
  memberId: string | null;
  name: string;
  avatarVersion: number | null;
  seedTier: StoredSeedTier;
  goalkeeperAvailable: boolean;
  assignedAsGoalkeeper?: boolean;
  formScore: number;
  desiredPositions: PlayerPosition[];
  playerStrength: PlayerStrength | null;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function nextPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

export function TeamDrawExperience({
  action,
  matchId,
  matchLabel,
  participants,
  defaultTeamCount,
  defaultLookbackMatches,
  disabled,
  hasTeams,
  initialDraw,
}: {
  action: (formData: FormData) => Promise<DrawResult>;
  matchId: string;
  matchLabel: string;
  participants: Participant[];
  defaultTeamCount: number;
  defaultLookbackMatches: number;
  disabled: boolean;
  hasTeams: boolean;
  initialDraw?: TeamDrawData | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"loading" | "countdown" | "drawing" | "complete" | "error">("loading");
  const [countdown, setCountdown] = useState(3);
  const [active, setActive] = useState<(Participant & { teamId: string; teamName: string; teamColor: string }) | null>(null);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [latestDraw, setLatestDraw] = useState<TeamDrawData | null>(initialDraw ?? null);
  const [presentationDraw, setPresentationDraw] = useState<TeamDrawData | null>(null);
  const [haptics, setHaptics] = useState(false);
  const openedAt = useRef(0);
  const sequence = useRef(0);
  const skipRequested = useRef(false);
  const dismissed = useRef(false);
  const flyingRef = useRef<HTMLDivElement>(null);
  const poolSlotRefs = useRef(new Map<string, HTMLSpanElement>());
  const teamRefs = useRef(new Map<string, HTMLElement>());
  const participantMap = useMemo(() => new Map(participants.map((participant) => [participant.participantId, participant])), [participants]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function beginGeneration() {
    sequence.current += 1;
    skipRequested.current = false;
    dismissed.current = false;
    openedAt.current = Date.now();
    setPhase("loading");
    setRevealed([]);
    setActive(null);
    setPresentationDraw(null);
    setOpen(true);
  }

  function orderedMembers(draw: TeamDrawData) {
    const ordered: Array<Participant & { teamId: string; teamName: string; teamColor: string; isLocked: boolean }> = [];
    const teams = [...draw.teams].sort((a, b) => a.index - b.index);
    for (const seed of ACTIVE_SEED_TIERS) {
      const groups = teams.map((team) => team.members.filter((member) => member.seedTier === seed && !member.assignedAsGoalkeeper));
      const rounds = Math.max(0, ...groups.map((members) => members.length));
      for (let round = 0; round < rounds; round += 1) {
        groups.forEach((members, teamIndex) => {
          const member = members[round];
          if (!member) return;
          const team = teams[teamIndex];
          ordered.push({
            ...member,
            avatarVersion: participantMap.get(member.participantId)?.avatarVersion ?? null,
            formScore: participantMap.get(member.participantId)?.formScore ?? 5000,
            desiredPositions: participantMap.get(member.participantId)?.desiredPositions ?? [],
            playerStrength: participantMap.get(member.participantId)?.playerStrength ?? null,
            goalkeeperAvailable: participantMap.get(member.participantId)?.goalkeeperAvailable ?? false,
            teamId: team.id,
            teamName: team.name,
            teamColor: team.color,
          });
        });
      }
    }
    teams.forEach((team) => team.members.filter((member) => member.assignedAsGoalkeeper).forEach((member) => ordered.push({
      ...member,
      avatarVersion: participantMap.get(member.participantId)?.avatarVersion ?? null,
      formScore: participantMap.get(member.participantId)?.formScore ?? 5000,
      desiredPositions: participantMap.get(member.participantId)?.desiredPositions ?? [],
      playerStrength: participantMap.get(member.participantId)?.playerStrength ?? null,
      goalkeeperAvailable: true,
      teamId: team.id, teamName: team.name, teamColor: team.color,
    })));
    return ordered;
  }

  async function play(draw: TeamDrawData, introDelay = 600) {
    const run = ++sequence.current;
    skipRequested.current = false;
    dismissed.current = false;
    setPresentationDraw(draw);
    setOpen(true);
    setPhase("loading");
    setRevealed(draw.teams.flatMap((team) => team.members.filter((member) => member.isLocked).map((member) => member.participantId)));
    setActive(null);
    await wait(introDelay);
    if (run !== sequence.current) return;
    setPhase("countdown");
    for (const value of [3, 2, 1]) {
      setCountdown(value);
      await wait(800);
      if (run !== sequence.current) return;
    }
    setPhase("drawing");

    const queue = orderedMembers(draw).filter((member) => !member.isLocked);
    for (const member of queue) {
      if (run !== sequence.current) return;
      if (skipRequested.current) break;
      setActive(member);
      await nextPaint();
      const card = flyingRef.current;
      const sourceAvatar = poolSlotRefs.current.get(member.participantId)?.querySelector<HTMLElement>(".member-identity-avatar");
      const activeAvatar = card?.querySelector<HTMLElement>(".member-identity-avatar");
      const target = teamRefs.current.get(member.teamId);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (card && target) {
        const from = card.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const source = sourceAvatar?.getBoundingClientRect();
        const avatar = activeAvatar?.getBoundingClientRect();
        const startX = source && avatar ? source.left + source.width / 2 - (avatar.left + avatar.width / 2) : 0;
        const startY = source && avatar ? source.top + source.height / 2 - (avatar.top + avatar.height / 2) : 0;
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + Math.min(to.height - 18, 54) - (from.top + from.height / 2);
        const animation = card.animate(reducedMotion ? [
          { opacity: 0, transform: "scale(.96)" },
          { opacity: 1, transform: "scale(1)" },
        ] : [
          { opacity: 1, transform: `translate3d(${startX}px, ${startY}px, 0) scale(.46)` },
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", offset: .078 },
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", offset: .444 },
          { opacity: 1, transform: `translate3d(${dx * .48}px, ${dy * .3 - 36}px, 0) scale(.86)`, offset: .67 },
          { opacity: 1, transform: `translate3d(${dx}px, ${dy}px, 0) scale(.5)`, offset: .889 },
          { opacity: 0, transform: `translate3d(${dx}px, ${dy}px, 0) scale(.28)` },
        ], { duration: reducedMotion ? 600 : 4500, easing: "cubic-bezier(.22,.8,.25,1)", fill: "forwards" });
        try { await animation.finished; } catch { /* Animation was skipped. */ }
      } else await wait(4500);
      setRevealed((current) => current.includes(member.participantId) ? current : [...current, member.participantId]);
      setActive(null);
      if (haptics) window.navigator.vibrate?.(20);
      await wait(80);
    }
    if (run !== sequence.current) return;
    setRevealed(draw.teams.flatMap((team) => team.members.map((member) => member.participantId)));
    setActive(null);
    setPhase("complete");
    router.refresh();
  }

  function skip() {
    skipRequested.current = true;
    flyingRef.current?.getAnimations().forEach((animation) => animation.finish());
  }

  function close() {
    sequence.current += 1;
    skipRequested.current = true;
    dismissed.current = true;
    setOpen(false);
    setActive(null);
    router.refresh();
  }

  const [state, formAction, pending] = useActionState(
    async (_current: DrawResult | null, formData: FormData) => {
      const result = await action(formData);
      if (!result.ok || !result.draw) {
        if (!dismissed.current) {
          setPhase("error");
          setOpen(true);
        }
        return result;
      }
      setLatestDraw(result.draw);
      if (!dismissed.current) void play(result.draw, Math.max(0, 3000 - (Date.now() - openedAt.current)));
      else router.refresh();
      return result;
    },
    null,
  );

  const draw = presentationDraw;
  const revealedSet = new Set(revealed);
  const lockedSet = new Set(draw?.teams.flatMap((team) => team.members.filter((member) => member.isLocked).map((member) => member.participantId)) ?? []);
  const poolExited = new Set([...revealed, ...lockedSet, ...(active ? [active.participantId] : [])]);
  const poolRings = participants.length > 12
    ? [participants.filter((_, index) => index % 2 === 0), participants.filter((_, index) => index % 2 === 1)]
    : [participants];
  const totalMembers = draw?.teams.reduce((sum, team) => sum + team.members.length, 0) ?? participants.length;
  const maxTeamSize = draw ? Math.max(...draw.teams.map((team) => team.members.length)) : 0;
  const density = maxTeamSize >= 8 || (draw?.teams.length ?? 0) >= 5 ? "dense" : maxTeamSize >= 6 ? "compact" : "normal";

  const stage = typeof document !== "undefined" && open ? createPortal(
    <section className={`team-draw-stage ${phase} ${density}`} role="dialog" aria-modal="true" aria-label="Bốc thăm chia đội">
      <header className="team-draw-header">
        <div><span className="eyebrow">Bốc thăm đội hình</span><strong>{matchLabel}</strong></div>
        <div className="team-draw-stage-actions">
          <button type="button" onClick={() => setHaptics((value) => !value)} aria-pressed={haptics}><Icon name={haptics ? "bolt" : "ban"} /> {haptics ? "Rung bật" : "Rung tắt"}</button>
          {phase !== "complete" && phase !== "error" && <button type="button" onClick={skip}>Bỏ qua</button>}
          <button type="button" onClick={close} aria-label="Đóng">×</button>
        </div>
      </header>

      <div className="team-draw-arena">
        <div className="team-draw-focus" aria-live="polite">
          {(phase === "loading" || phase === "countdown" || phase === "drawing") && <div className="team-draw-machine" aria-hidden="true">
            <span className="team-draw-ball"><Icon name="futbol" /></span>
            {poolRings.map((ring, ringIndex) => <div className={`team-draw-pool ring-${ringIndex + 1}`} key={ringIndex}>
              {ring.map((participant, index) => <span
                ref={(node) => {
                  if (node) poolSlotRefs.current.set(participant.participantId, node);
                  else poolSlotRefs.current.delete(participant.participantId);
                }}
                className={poolExited.has(participant.participantId) ? "exited" : "waiting"}
                style={{
                  "--pool-angle": `${(index * 360) / ring.length}deg`,
                  "--pool-angle-negative": `${(-index * 360) / ring.length}deg`,
                } as React.CSSProperties}
                key={participant.participantId}
              ><MemberAvatar memberId={participant.memberId} name={participant.name} avatarVersion={participant.avatarVersion} /></span>)}
            </div>)}
          </div>}
          {phase === "loading" && <div className="team-draw-loading"><strong>{pending ? "Đang cân bằng đội hình" : "Chuẩn bị công bố"}</strong><small>Seed · Vị trí · Thế mạnh · Phong độ</small></div>}
          {phase === "countdown" && <strong className="team-draw-countdown" key={countdown}>{countdown}</strong>}
          {phase === "drawing" && active && <div ref={flyingRef} className="team-draw-player" style={{ "--destination-color": active.teamColor } as React.CSSProperties}>
            <MemberAvatar memberId={active.memberId} name={active.name} avatarVersion={active.avatarVersion} className="large" />
            <span className="team-draw-player-meta">
              <strong>{active.name}</strong><small>{SEED_LABELS[active.seedTier]}{active.assignedAsGoalkeeper ? " · Thủ môn" : ""} · {playerPositionsLabel(active.desiredPositions)} · {playerStrengthLabel(active.playerStrength)} · {Math.round(active.formScore / 100)} điểm phong độ</small><b>{active.teamName}</b>
            </span>
          </div>}
          {phase === "complete" && <div className="team-draw-complete"><Icon name="trophy" /><strong>Đội hình đã hoàn tất</strong><small>{totalMembers} cầu thủ · {draw?.teams.length ?? 0} đội</small></div>}
          {phase === "error" && <div className="team-draw-error"><Icon name="triangle-exclamation" /><strong>Không thể chia đội</strong><small>{state?.message}</small></div>}
        </div>

        {draw && <div className="team-draw-destinations" style={{ "--draw-team-count": draw.teams.length } as React.CSSProperties}>
          {draw.teams.map((team) => <article className="team-draw-destination" style={{ "--team-color": team.color } as React.CSSProperties} ref={(node) => { if (node) teamRefs.current.set(team.id, node); else teamRefs.current.delete(team.id); }} key={team.id}>
            <header><strong>{team.name}</strong><span>{team.members.filter((member) => revealedSet.has(member.participantId)).length}/{team.members.length}</span></header>
            <ol>
              {team.members.map((member) => {
                const memberDetail = participantMap.get(member.participantId);
                const isRevealed = revealedSet.has(member.participantId);
                return <li className={isRevealed ? "revealed" : "waiting"} key={member.participantId} title={member.name}>
                  {isRevealed ? <span className="team-draw-member-entry">
                    <MemberAvatar memberId={member.memberId} name={member.name} avatarVersion={memberDetail?.avatarVersion} />
                    <span><strong>{member.name}</strong><small>{SEED_LABELS[member.seedTier]}{member.assignedAsGoalkeeper ? " · Thủ môn" : ""} · {playerPositionsLabel(memberDetail?.desiredPositions)} · {Math.round((memberDetail?.formScore ?? 5000) / 100)} điểm</small></span>
                  </span> : <span className="team-draw-member-waiting">Đang chờ…</span>}
                  {member.isLocked && <Icon name="shield" />}
                </li>;
              })}
            </ol>
          </article>)}
        </div>}
      </div>

      <footer className="team-draw-footer">
        <div><span style={{ width: `${totalMembers ? (revealed.length / totalMembers) * 100 : 0}%` }} /></div>
        <strong>{Math.min(revealed.length, totalMembers)} / {totalMembers} cầu thủ</strong>
        {phase === "complete" && <><button type="button" onClick={() => draw && void play(draw)}>Xem lại bốc thăm</button><button type="button" className="primary" onClick={close}>Xem đội hình</button></>}
      </footer>
    </section>,
    document.body,
  ) : null;

  return <>
    <form action={formAction} className="team-config-form" onSubmit={beginGeneration}>
      <input type="hidden" name="matchId" value={matchId} />
      <div className="team-config-fields">
        <TeamCountField memberCount={participants.length} defaultValue={defaultTeamCount} />
        <label>Số trận gần nhất<input name="lookbackMatches" type="number" min="1" max="30" defaultValue={defaultLookbackMatches} required /></label>
      </div>
      <div className="team-config-actions">
        {latestDraw && <button className="button secondary" type="button" onClick={() => void play(latestDraw)}>Xem lại bốc thăm</button>}
        <button className="button primary" type="submit" disabled={disabled || pending}>{pending ? "Đang cân bằng…" : hasTeams ? "Chia lại đội" : "Tạo đội cân bằng"}</button>
      </div>
      {state && !state.ok && <p className="form-message error">{state.message}</p>}
    </form>
    {stage}
  </>;
}
