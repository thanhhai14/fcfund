import "server-only";

import { db } from "@/db";
import { activityLogs } from "@/db/schema";

type ActivityInput = {
  clubId: string;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "RESET_PASSWORD" | "COMMENT";
  actorId?: string | null;
  message?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
};

export async function logActivity(input: ActivityInput) {
  await db.insert(activityLogs).values({
    clubId: input.clubId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actorId ?? null,
    message: input.message ?? null,
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
  });
}
