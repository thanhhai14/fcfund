import type { StoredSeedTier } from "./seed-tier";

export type TeamDrawSnapshot = {
  runId: string;
  source?: "ORIGINAL_DRAW" | "LEGACY_FINAL_LINEUP";
  teams: Array<{
    id: string;
    index: number;
    name: string;
    color: string;
    goalkeeperCount: number;
    members: Array<{
      participantId: string;
      memberId: string | null;
      name: string;
      avatarVersion: number | null;
      seedTier: StoredSeedTier;
      assignedAsGoalkeeper: boolean;
      isLocked: boolean;
    }>;
  }>;
};
