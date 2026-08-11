import { initials } from "@/lib/format";

export function memberAvatarSrc(memberId: string, version?: string | number | Date | null) {
  const value = version instanceof Date ? version.getTime() : version;
  return `/api/member-assets/${memberId}/avatar${value ? `?v=${encodeURIComponent(String(value))}` : ""}`;
}

export function userAvatarSrc(userId: string, version?: string | number | Date | null) {
  const value = version instanceof Date ? version.getTime() : version;
  return `/api/user-assets/${userId}/avatar${value ? `?v=${encodeURIComponent(String(value))}` : ""}`;
}

export function MemberAvatar({ memberId, userId, name, avatarVersion, avatarUrl, className = "" }: { memberId?: string | null; userId?: string | null; name: string; avatarVersion?: string | number | Date | null; avatarUrl?: string | null; className?: string }) {
  const avatarSrc = avatarUrl ?? (userId ? userAvatarSrc(userId, avatarVersion) : memberId ? memberAvatarSrc(memberId, avatarVersion) : null);
  return <span className={`member-identity-avatar ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {avatarSrc && (avatarUrl || avatarVersion) ? <img src={avatarSrc} alt={`Avatar ${name}`} width="96" height="96" /> : initials(name)}
  </span>;
}

export function MemberIdentity({ memberId, userId, name, avatarVersion, avatarUrl, secondary, compact = false }: { memberId?: string | null; userId?: string | null; name: string; avatarVersion?: string | number | Date | null; avatarUrl?: string | null; secondary?: string | null; compact?: boolean }) {
  return <span className={`member-identity ${compact ? "compact" : ""}`}>
    <MemberAvatar memberId={memberId} userId={userId} name={name} avatarVersion={avatarVersion} avatarUrl={avatarUrl} />
    <span><strong>{name}</strong>{secondary && <small>{secondary}</small>}</span>
  </span>;
}
