import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions, userPermissionOverrides } from "@/db/schema";
import type { PermissionKey } from "./constants";
import { getCurrentUser, requireUser } from "./auth";

export async function can(permission: PermissionKey) {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const [override] = await db
    .select({ allowed: userPermissionOverrides.allowed })
    .from(userPermissionOverrides)
    .where(
      and(
        eq(userPermissionOverrides.userId, user.id),
        eq(userPermissionOverrides.permissionKey, permission),
      ),
    )
    .limit(1);

  if (override) return override.allowed;

  const [policy] = await db
    .select({ allowed: rolePermissions.allowed })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.role, user.role),
        eq(rolePermissions.permissionKey, permission),
      ),
    )
    .limit(1);

  return policy?.allowed ?? false;
}

export async function requirePermission(permission: PermissionKey) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && !(await can(permission))) {
    throw new Error("Bạn không có quyền thực hiện thao tác này.");
  }
  return user;
}
