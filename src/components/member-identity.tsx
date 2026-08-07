import { initials } from "@/lib/format";

export function memberAvatarSrc(memberId: string, version?: string | number | Date | null) {
  const value = version instanceof Date ? version.getTime() : version;
  return `/api/member-assets/${memberId}/avatar${value ? `?v=${encodeURIComponent(String(value))}` : ""}`;
}

export function userAvatarSrc(userId: string, version?: string | number | Date | null) {
  const value = version instanceof Date ? version.getTime() : version;
  return `/api/user-assets/${userId}/avatar${value ? `?v=${encodeURIComponent(String(value))}` : ""}`;
}

export function MemberAvatar({ memberId, userId, name, avatarVersion, className = "" }: { memberId?: string | null; userId?: string | null; name: string; avatarVersion?: string | number | Date | null; className?: string }) {
  const avatarSrc = userId ? userAvatarSrc(userId, avatarVersion) : memberId ? memberAvatarSrc(memberId, avatarVersion) : null;
  return <span className={`member-identity-avatar ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {avatarSrc && avatarVersion ? <img src={avatarSrc} alt={`Avatar ${name}`} /> : initials(name)}
  </span>;
}

export function MemberIdentity({ memberId, userId, name, avatarVersion, secondary, compact = false }: { memberId?: string | null; userId?: string | null; name: string; avatarVersion?: string | number | Date | null; secondary?: string | null; compact?: boolean }) {
  return <span className={`member-identity ${compact ? "compact" : ""}`}>
    <MemberAvatar memberId={memberId} userId={userId} name={name} avatarVersion={avatarVersion} />
    <span><strong>{name}</strong>{secondary && <small>{secondary}</small>}</span>
  </span>;
}
