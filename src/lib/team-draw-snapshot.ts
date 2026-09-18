import type { StoredSeedTier } from "./seed-tier";

export type TeamDrawSnapshot = {
  runId: string;
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
