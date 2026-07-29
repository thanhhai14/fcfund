import { hash } from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import {
  chargeTypes,
  clubs,
  fundCategories,
  members,
  permissions,
  rolePermissions,
  users,
} from "../src/db/schema";
import {
  DEFAULT_PASSWORD,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
} from "../src/lib/constants";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client);

const adminPermissions = Object.values(PERMISSIONS);
const treasurerPermissions = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.MEMBERS_VIEW,
  PERMISSIONS.CHARGES_VIEW_ALL,
  PERMISSIONS.CHARGES_MANAGE,
  PERMISSIONS.PAYMENTS_VIEW_ALL,
  PERMISSIONS.PAYMENTS_MANAGE,
  PERMISSIONS.EXPENSES_VIEW,
  PERMISSIONS.EXPENSES_MANAGE,
  PERMISSIONS.MATCHES_VIEW,
  PERMISSIONS.MATCHES_MANAGE,
  PERMISSIONS.CLUB_BALANCE_VIEW,
  PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW,
  PERMISSIONS.AUDIT_VIEW,
];
const memberPermissions = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.CHARGES_VIEW_OWN,
  PERMISSIONS.PAYMENTS_VIEW_OWN,
  PERMISSIONS.EXPENSES_VIEW,
  PERMISSIONS.MATCHES_VIEW,
];

async function seed() {
  console.log("Seeding FCFUND...");

  const [club] = await db
    .insert(clubs)
    .values({ name: "Đội bóng của tôi" })
    .onConflictDoNothing()
    .returning();

  const activeClub =
    club ??
    (
      await db.select().from(clubs).limit(1)
    )[0];

  if (!activeClub) throw new Error("Could not create club.");

  await db.insert(permissions).values(PERMISSION_DEFINITIONS).onConflictDoNothing();

  for (const [role, allowedKeys] of [
    ["ADMIN", adminPermissions],
    ["TREASURER", treasurerPermissions],
    ["MEMBER", memberPermissions],
  ] as const) {
    const allowedSet = new Set<string>(allowedKeys);
    await db
      .insert(rolePermissions)
      .values(
        PERMISSION_DEFINITIONS.map((permission) => ({
          role,
          permissionKey: permission.key,
          allowed: allowedSet.has(permission.key),
        })),
      )
      .onConflictDoUpdate({
        target: [rolePermissions.role, rolePermissions.permissionKey],
        set: { allowed: sql`excluded.allowed` },
      });
  }

  await db
    .insert(chargeTypes)
    .values([
      {
        clubId: activeClub.id,
        name: "Quỹ tháng",
        calculation: "MONTHLY",
        defaultAmount: 200_000,
        iconName: "calendar",
        color: "#2e7d58",
      },
      {
        clubId: activeClub.id,
        name: "Quỹ lẻ",
        calculation: "OCCURRENCE",
        defaultAmount: 50_000,
        iconName: "futbol",
        color: "#3478f6",
      },
      {
        clubId: activeClub.id,
        name: "Mời nước",
        calculation: "OCCURRENCE",
        defaultAmount: 36_000,
        iconName: "glass-water",
        color: "#e67e42",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(fundCategories)
    .values([
      { clubId: activeClub.id, name: "Tiền thành viên nộp", direction: "IN", isSystem: true },
      { clubId: activeClub.id, name: "Tài trợ / Thu khác", direction: "IN" },
      { clubId: activeClub.id, name: "Tiền sân", direction: "OUT" },
      { clubId: activeClub.id, name: "Tiền nước", direction: "OUT" },
      { clubId: activeClub.id, name: "Dụng cụ", direction: "OUT" },
    ])
    .onConflictDoNothing();

  const adminPhone = (process.env.SEED_ADMIN_PHONE ?? "0900000000").replace(/\D/g, "");
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  const [adminMember] = await db
    .insert(members)
    .values({
      clubId: activeClub.id,
      code: "ADMIN",
      fullName: "Quản trị viên",
      phone: adminPhone,
      joinedOn: new Date().toISOString().slice(0, 10),
    })
    .onConflictDoNothing()
    .returning();

  const member =
    adminMember ??
    (
      await db.select().from(members).limit(1)
    )[0];

  await db
    .insert(users)
    .values({
      clubId: activeClub.id,
      memberId: member?.id,
      phoneNormalized: adminPhone,
      passwordHash: await hash(password, 12),
      role: "ADMIN",
    })
    .onConflictDoNothing();

  console.log(`Admin phone: ${adminPhone}`);
  console.log("Seed completed.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
