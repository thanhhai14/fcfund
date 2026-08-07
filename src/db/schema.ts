import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const userRole = pgEnum("user_role", ["ADMIN", "TREASURER", "ORGANIZER", "MEMBER"]);
export const memberStatus = pgEnum("member_status", ["ACTIVE", "INACTIVE"]);
export const chargeCalculation = pgEnum("charge_calculation", ["MONTHLY", "OCCURRENCE"]);
export const chargeSource = pgEnum("charge_source", ["AUTO_MONTHLY", "MANUAL", "MATCH", "ADJUSTMENT"]);
export const fundDirection = pgEnum("fund_direction", ["IN", "OUT"]);
export const fundTransactionKind = pgEnum("fund_transaction_kind", [
  "MEMBER_PAYMENT",
  "OTHER_INCOME",
  "EXPENSE",
  "OPENING_BALANCE",
  "ADJUSTMENT",
]);
export const activityAction = pgEnum("activity_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "RESTORE",
  "RESET_PASSWORD",
  "COMMENT",
]);
export const jobStatus = pgEnum("job_status", ["RUNNING", "COMPLETED", "FAILED"]);
export const memberSeedTier = pgEnum("member_seed_tier", [
  "TIER_1",
  "TIER_2",
  "TIER_3",
  "TIER_4",
  "GOALKEEPER",
]);
export const matchTeamVersionStatus = pgEnum("match_team_version_status", [
  "DRAFT",
  "CONFIRMED",
  "SUPERSEDED",
]);
export const matchStatResult = pgEnum("match_stat_result", ["WIN", "LOSS", "UNRANKED"]);
export const matchStatSource = pgEnum("match_stat_source", ["RECORDED", "PENALTY_INFERRED"]);

export const clubs = pgTable("clubs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  logoUrl: text("logo_url"),
  qrUrl: text("qr_url"),
  bankName: varchar("bank_name", { length: 160 }),
  bankAccountNumber: varchar("bank_account_number", { length: 80 }),
  bankAccountHolder: varchar("bank_account_holder", { length: 160 }),
  timezone: varchar("timezone", { length: 80 }).default("Asia/Ho_Chi_Minh").notNull(),
  ...auditColumns,
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    status: memberStatus("status").default("ACTIVE").notNull(),
    joinedOn: date("joined_on"),
    leftOn: date("left_on"),
    note: text("note"),
    ...auditColumns,
  },
  (table) => [
    unique("members_club_code_unique").on(table.clubId, table.code),
    index("members_club_status_idx").on(table.clubId, table.status),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    phoneNormalized: varchar("phone_normalized", { length: 24 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("users_phone_unique").on(table.phoneNormalized),
    uniqueIndex("users_member_unique").on(table.memberId).where(sql`${table.memberId} IS NOT NULL`),
    index("users_club_role_idx").on(table.clubId, table.role),
  ],
);

export const memberProfiles = pgTable("member_profiles", {
  memberId: uuid("member_id").primaryKey().references(() => members.id, { onDelete: "cascade" }),
  bio: text("bio"),
  nickname: varchar("nickname", { length: 100 }),
  preferredPosition: varchar("preferred_position", { length: 100 }),
  preferredFoot: varchar("preferred_foot", { length: 20 }),
  shirtNumber: integer("shirt_number"),
  ...auditColumns,
}, (table) => [
  check("member_profiles_shirt_number_range", sql`${table.shirtNumber} IS NULL OR (${table.shirtNumber} >= 0 AND ${table.shirtNumber} <= 99)`),
]);

export const avatars = pgTable("avatars", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  blobUrl: text("blob_url").notNull(),
  pathname: text("pathname").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  ...auditColumns,
}, (table) => [
  uniqueIndex("avatars_member_unique").on(table.memberId).where(sql`${table.memberId} IS NOT NULL`),
  uniqueIndex("avatars_user_unique").on(table.userId).where(sql`${table.userId} IS NOT NULL`),
  index("avatars_club_idx").on(table.clubId),
  check("avatars_owner_required", sql`${table.memberId} IS NOT NULL OR ${table.userId} IS NOT NULL`),
  check("avatars_file_size_positive", sql`${table.fileSize} > 0`),
]);

export const permissions = pgTable("permissions", {
  key: varchar("key", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: userRole("role").notNull(),
    permissionKey: varchar("permission_key", { length: 100 })
      .references(() => permissions.key, { onDelete: "cascade" })
      .notNull(),
    allowed: boolean("allowed").default(false).notNull(),
  },
  (table) => [primaryKey({ columns: [table.role, table.permissionKey] })],
);

export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    permissionKey: varchar("permission_key", { length: 100 })
      .references(() => permissions.key, { onDelete: "cascade" })
      .notNull(),
    allowed: boolean("allowed").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.permissionKey] })],
);

export const chargeTypes = pgTable(
  "charge_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    calculation: chargeCalculation("calculation").notNull(),
    defaultAmount: bigint("default_amount", { mode: "number" }).default(0).notNull(),
    iconName: varchar("icon_name", { length: 100 }).default("wallet").notNull(),
    iconStyle: varchar("icon_style", { length: 40 }).default("solid").notNull(),
    color: varchar("color", { length: 20 }).default("#2e7d58"),
    reportAsIcon: boolean("report_as_icon").default(false).notNull(),
    isLossPenalty: boolean("is_loss_penalty").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...auditColumns,
  },
  (table) => [
    unique("charge_types_club_name_unique").on(table.clubId, table.name),
    check("charge_types_amount_nonnegative", sql`${table.defaultAmount} >= 0`),
  ],
);

export const memberChargeAssignments = pgTable(
  "member_charge_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }).notNull(),
    chargeTypeId: uuid("charge_type_id").references(() => chargeTypes.id, { onDelete: "restrict" }).notNull(),
    customAmount: bigint("custom_amount", { mode: "number" }),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until"),
    isActive: boolean("is_active").default(true).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
  },
  (table) => [
    index("assignments_member_idx").on(table.memberId),
    index("assignments_effective_idx").on(table.validFrom, table.validUntil, table.isActive),
    check("assignments_amount_nonnegative", sql`${table.customAmount} IS NULL OR ${table.customAmount} >= 0`),
    check("assignments_valid_range", sql`${table.validUntil} IS NULL OR ${table.validUntil} >= ${table.validFrom}`),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    playedOn: date("played_on").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [index("matches_club_date_idx").on(table.clubId, table.playedOn)],
);

export const matchParticipants = pgTable(
  "match_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }).notNull(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    guestName: varchar("guest_name", { length: 160 }),
    seedTier: memberSeedTier("seed_tier"),
    seedEvaluatedAt: timestamp("seed_evaluated_at", { withTimezone: true }),
    seedEvaluatedBy: uuid("seed_evaluated_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
  },
  (table) => [
    index("match_participants_match_idx").on(table.matchId),
    uniqueIndex("match_participant_member_unique")
      .on(table.matchId, table.memberId)
      .where(sql`${table.memberId} IS NOT NULL`),
    check("participant_identity_required", sql`${table.memberId} IS NOT NULL OR ${table.guestName} IS NOT NULL`),
  ],
);

export const matchTeamVersions = pgTable(
  "match_team_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }).notNull(),
    version: integer("version").notNull(),
    status: matchTeamVersionStatus("status").default("DRAFT").notNull(),
    randomKey: varchar("random_key", { length: 100 }),
    teamCount: integer("team_count").default(2).notNull(),
    lookbackMatches: integer("lookback_matches").default(10).notNull(),
    tierLockedAt: timestamp("tier_locked_at", { withTimezone: true }),
    tierLockedBy: uuid("tier_locked_by").references(() => users.id, { onDelete: "set null" }),
    metrics: jsonb("metrics").default({}).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    unique("match_team_version_number_unique").on(table.matchId, table.version),
    uniqueIndex("match_team_one_draft_unique").on(table.matchId).where(sql`${table.status} = 'DRAFT'`),
    uniqueIndex("match_team_one_confirmed_unique").on(table.matchId).where(sql`${table.status} = 'CONFIRMED'`),
    check("match_team_version_number_positive", sql`${table.version} > 0`),
    check("match_team_count_minimum", sql`${table.teamCount} >= 2`),
    check("match_team_lookback_positive", sql`${table.lookbackMatches} > 0`),
  ],
);

export const matchTeams = pgTable(
  "match_teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id").references(() => matchTeamVersions.id, { onDelete: "cascade" }).notNull(),
    teamIndex: integer("team_index").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    color: varchar("color", { length: 20 }),
    memberCount: integer("member_count").default(0).notNull(),
    goalkeeperCount: integer("goalkeeper_count").default(0).notNull(),
    outfieldSkillScore: integer("outfield_skill_score").default(0).notNull(),
    recentLossScore: integer("recent_loss_score").default(0).notNull(),
    formScoreTotal: integer("form_score_total").default(0).notNull(),
    lowFormCount: integer("low_form_count").default(0).notNull(),
  },
  (table) => [
    unique("match_team_index_unique").on(table.versionId, table.teamIndex),
    check("match_team_index_positive", sql`${table.teamIndex} > 0`),
    check("match_team_counts_nonnegative", sql`${table.memberCount} >= 0 AND ${table.goalkeeperCount} >= 0 AND ${table.formScoreTotal} >= 0 AND ${table.lowFormCount} >= 0`),
  ],
);

export const matchTeamMembers = pgTable(
  "match_team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id").references(() => matchTeamVersions.id, { onDelete: "cascade" }).notNull(),
    teamId: uuid("team_id").references(() => matchTeams.id, { onDelete: "cascade" }).notNull(),
    participantId: uuid("participant_id").references(() => matchParticipants.id, { onDelete: "set null" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    displayNameSnapshot: varchar("display_name_snapshot", { length: 160 }).notNull(),
    seedTierSnapshot: memberSeedTier("seed_tier_snapshot").notNull(),
    recentMatchCountSnapshot: integer("recent_match_count_snapshot").default(0).notNull(),
    recentLossCountSnapshot: integer("recent_loss_count_snapshot").default(0).notNull(),
    recentLossRateSnapshot: integer("recent_loss_rate_snapshot"),
    formScoreSnapshot: integer("form_score_snapshot").default(5000).notNull(),
    formConfidenceSnapshot: integer("form_confidence_snapshot").default(0).notNull(),
    inferredMatchCountSnapshot: integer("inferred_match_count_snapshot").default(0).notNull(),
    isLocked: boolean("is_locked").default(false).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("match_team_participant_version_unique")
      .on(table.versionId, table.participantId)
      .where(sql`${table.participantId} IS NOT NULL`),
    index("match_team_members_team_idx").on(table.teamId),
    check("match_team_member_history_nonnegative", sql`${table.recentMatchCountSnapshot} >= 0 AND ${table.recentLossCountSnapshot} >= 0 AND ${table.inferredMatchCountSnapshot} >= 0`),
    check("match_team_member_loss_rate_range", sql`${table.recentLossRateSnapshot} IS NULL OR (${table.recentLossRateSnapshot} >= 0 AND ${table.recentLossRateSnapshot} <= 10000)`),
    check("match_team_member_form_score_range", sql`${table.formScoreSnapshot} >= 0 AND ${table.formScoreSnapshot} <= 10000`),
    check("match_team_member_form_confidence_range", sql`${table.formConfidenceSnapshot} >= 0 AND ${table.formConfidenceSnapshot} <= 10000`),
  ],
);

export const memberMatchStats = pgTable(
  "member_match_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }).notNull(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }).notNull(),
    teamVersionId: uuid("team_version_id").references(() => matchTeamVersions.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => matchTeams.id, { onDelete: "set null" }),
    playedOn: date("played_on").notNull(),
    teamCount: integer("team_count"),
    placement: integer("placement"),
    isTied: boolean("is_tied").default(false).notNull(),
    result: matchStatResult("result").notNull(),
    source: matchStatSource("source").notNull(),
    placementScore: integer("placement_score").notNull(),
    formulaVersion: integer("formula_version").default(1).notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
  },
  (table) => [
    unique("member_match_stats_member_match_unique").on(table.memberId, table.matchId),
    index("member_match_stats_member_date_idx").on(table.memberId, table.playedOn),
    index("member_match_stats_club_match_idx").on(table.clubId, table.matchId),
    check("member_match_stats_team_placement_valid", sql`(${table.teamCount} IS NULL AND ${table.placement} IS NULL) OR (${table.teamCount} IS NOT NULL AND ${table.placement} IS NOT NULL AND ${table.teamCount} >= 2 AND ${table.placement} >= 1 AND ${table.placement} <= ${table.teamCount})`),
    check("member_match_stats_score_range", sql`${table.placementScore} >= 0 AND ${table.placementScore} <= 10000`),
    check("member_match_stats_formula_positive", sql`${table.formulaVersion} > 0`),
  ],
);

export const memberCharges = pgTable(
  "member_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "restrict" }).notNull(),
    chargeTypeId: uuid("charge_type_id").references(() => chargeTypes.id, { onDelete: "restrict" }).notNull(),
    assignmentId: uuid("assignment_id").references(() => memberChargeAssignments.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    source: chargeSource("source").notNull(),
    chargeDate: date("charge_date").notNull(),
    periodMonth: date("period_month"),
    quantity: integer("quantity").default(1).notNull(),
    unitAmount: bigint("unit_amount", { mode: "number" }).notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    isLossPenaltySnapshot: boolean("is_loss_penalty_snapshot").default(false).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("member_charges_member_date_idx").on(table.memberId, table.chargeDate),
    index("member_charges_type_period_idx").on(table.chargeTypeId, table.periodMonth),
    uniqueIndex("member_charges_auto_month_unique")
      .on(table.assignmentId, table.periodMonth)
      .where(sql`${table.source} = 'AUTO_MONTHLY' AND ${table.deletedAt} IS NULL`),
    check("member_charges_quantity_positive", sql`${table.quantity} > 0`),
    check("member_charges_amount_nonnegative", sql`${table.unitAmount} >= 0 AND ${table.totalAmount} >= 0`),
  ],
);

export const fundCategories = pgTable(
  "fund_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    direction: fundDirection("direction").notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...auditColumns,
  },
  (table) => [unique("fund_categories_club_name_direction_unique").on(table.clubId, table.name, table.direction)],
);

export const fundTransactions = pgTable(
  "fund_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    direction: fundDirection("direction").notNull(),
    kind: fundTransactionKind("kind").notNull(),
    categoryId: uuid("category_id").references(() => fundCategories.id, { onDelete: "set null" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "restrict" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("fund_transactions_member_date_idx").on(table.memberId, table.transactionDate),
    index("fund_transactions_club_date_direction_idx").on(table.clubId, table.transactionDate, table.direction),
    check("fund_transactions_amount_positive", sql`${table.amount} > 0`),
    check(
      "member_payment_identity",
      sql`${table.kind} <> 'MEMBER_PAYMENT' OR (${table.memberId} IS NOT NULL AND ${table.direction} = 'IN')`,
    ),
  ],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: activityAction("action").notNull(),
    message: text("message"),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("activity_entity_date_idx").on(table.entityType, table.entityId, table.createdAt)],
);

export const monthlyJobRuns = pgTable("monthly_job_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  periodMonth: date("period_month").unique().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: jobStatus("status").default("RUNNING").notNull(),
  createdCount: integer("created_count").default(0).notNull(),
  errorMessage: text("error_message"),
});

export type Club = typeof clubs.$inferSelect;
export type Member = typeof members.$inferSelect;
export type User = typeof users.$inferSelect;
export type ChargeType = typeof chargeTypes.$inferSelect;
export type MemberCharge = typeof memberCharges.$inferSelect;
export type FundTransaction = typeof fundTransactions.$inferSelect;
