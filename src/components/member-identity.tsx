import { initials } from "@/lib/format";

export function memberAvatarSrc(memberId: string, version?: string | number | Date | null) {
  const value = version instanceof Date ? version.getTime() : version;
  return `/api/member-assets/${memberId}/avatar${value ? `?v=${encodeURIComponent(String(value))}` : ""}`;
}

export function MemberAvatar({ memberId, name, avatarVersion, className = "" }: { memberId?: string | null; name: string; avatarVersion?: string | number | Date | null; className?: string }) {
  return <span className={`member-identity-avatar ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {memberId && avatarVersion ? <img src={memberAvatarSrc(memberId, avatarVersion)} alt={`Avatar ${name}`} /> : initials(name)}
  </span>;
}

export function MemberIdentity({ memberId, name, avatarVersion, secondary, compact = false }: { memberId?: string | null; name: string; avatarVersion?: string | number | Date | null; secondary?: string | null; compact?: boolean }) {
  return <span className={`member-identity ${compact ? "compact" : ""}`}>
    <MemberAvatar memberId={memberId} name={name} avatarVersion={avatarVersion} />
    <span><strong>{name}</strong>{secondary && <small>{secondary}</small>}</span>
  </span>;
}
