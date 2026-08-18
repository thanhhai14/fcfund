"use client";

import { useState } from "react";
import { Icon } from "./icon";
import { minimumParticipantsForTeams, plannedGoalkeeperCount, plannedTeamSizes } from "@/lib/team-roster-rules";

export function TeamCountField({ memberCount, goalkeeperCandidates, defaultValue }: { memberCount: number; goalkeeperCandidates: number; defaultValue: number }) {
  const [teamCount, setTeamCount] = useState(defaultValue);
  const goalkeeperCount = plannedGoalkeeperCount(teamCount, goalkeeperCandidates);
  const minimumMembers = minimumParticipantsForTeams(teamCount, goalkeeperCandidates);
  const isValid = goalkeeperCandidates >= 2 && memberCount >= minimumMembers;
  const sizes = isValid ? plannedTeamSizes(memberCount, teamCount, goalkeeperCandidates) : [];
  const borrowedTeams = Math.max(0, teamCount - goalkeeperCount);

  return <div className="team-count-field">
    <label>Số đội<input name="teamCount" type="number" min="2" max={Math.max(2, memberCount)} value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))} required /></label>
    {!isValid && Number.isInteger(teamCount) && teamCount >= 2 && <p className="team-distribution warning">
      <Icon name="triangle-exclamation" />
      {goalkeeperCandidates < 2 ? "Cần ít nhất 2 thủ môn" : `Cần ít nhất ${minimumMembers} người cho ${goalkeeperCount} thủ môn`}
    </p>}
    {!!sizes.length && <p className={borrowedTeams ? "team-distribution warning" : "team-distribution"}>
      {borrowedTeams > 0 && <Icon name="triangle-exclamation" />}
      Dự kiến: {sizes.join(" – ")} người{borrowedTeams ? ` · ${borrowedTeams} đội mượn thủ môn` : ""}
    </p>}
  </div>;
}
