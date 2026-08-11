"use client";

import { useState } from "react";
import { Icon } from "./icon";

function distribution(memberCount: number, teamCount: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > memberCount) return [];
  const base = Math.floor(memberCount / teamCount);
  const extra = memberCount % teamCount;
  return Array.from({ length: teamCount }, (_, index) => base + (index < extra ? 1 : 0));
}

export function TeamCountField({ memberCount, defaultValue }: { memberCount: number; defaultValue: number }) {
  const [teamCount, setTeamCount] = useState(defaultValue);
  const sizes = distribution(memberCount, teamCount);
  const hasSmallTeam = sizes.some((size) => size < 5);

  return <div className="team-count-field">
    <label>Số đội<input name="teamCount" type="number" min="2" max={Math.max(2, memberCount)} value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))} required /></label>
    {!!sizes.length && <p className={hasSmallTeam ? "team-distribution warning" : "team-distribution"}>
      {hasSmallTeam && <Icon name="triangle-exclamation" />}
      Dự kiến: {sizes.join(" – ")} người{hasSmallTeam ? " · Có đội dưới 5 người" : ""}
    </p>}
  </div>;
}
