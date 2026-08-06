CREATE TYPE "public"."match_team_version_status" AS ENUM('DRAFT', 'CONFIRMED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."member_seed_tier" AS ENUM('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'GOALKEEPER');--> statement-breakpoint
CREATE TABLE "match_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"participant_id" uuid,
	"member_id" uuid,
	"display_name_snapshot" varchar(160) NOT NULL,
	"seed_tier_snapshot" "member_seed_tier" NOT NULL,
	"recent_match_count_snapshot" integer DEFAULT 0 NOT NULL,
	"recent_loss_count_snapshot" integer DEFAULT 0 NOT NULL,
	"recent_loss_rate_snapshot" integer,
	"is_locked" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "match_team_member_history_nonnegative" CHECK ("match_team_members"."recent_match_count_snapshot" >= 0 AND "match_team_members"."recent_loss_count_snapshot" >= 0),
	CONSTRAINT "match_team_member_loss_rate_range" CHECK ("match_team_members"."recent_loss_rate_snapshot" IS NULL OR ("match_team_members"."recent_loss_rate_snapshot" >= 0 AND "match_team_members"."recent_loss_rate_snapshot" <= 10000))
);
--> statement-breakpoint
CREATE TABLE "match_team_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "match_team_version_status" DEFAULT 'DRAFT' NOT NULL,
	"random_key" varchar(100),
	"team_count" integer DEFAULT 2 NOT NULL,
	"lookback_matches" integer DEFAULT 10 NOT NULL,
	"tier_locked_at" timestamp with time zone,
	"tier_locked_by" uuid,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_team_version_number_unique" UNIQUE("match_id","version"),
	CONSTRAINT "match_team_version_number_positive" CHECK ("match_team_versions"."version" > 0),
	CONSTRAINT "match_team_count_minimum" CHECK ("match_team_versions"."team_count" >= 2),
	CONSTRAINT "match_team_lookback_positive" CHECK ("match_team_versions"."lookback_matches" > 0)
);
--> statement-breakpoint
CREATE TABLE "match_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"team_index" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(20),
	"member_count" integer DEFAULT 0 NOT NULL,
	"goalkeeper_count" integer DEFAULT 0 NOT NULL,
	"outfield_skill_score" integer DEFAULT 0 NOT NULL,
	"recent_loss_score" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "match_team_index_unique" UNIQUE("version_id","team_index"),
	CONSTRAINT "match_team_index_positive" CHECK ("match_teams"."team_index" > 0),
	CONSTRAINT "match_team_counts_nonnegative" CHECK ("match_teams"."member_count" >= 0 AND "match_teams"."goalkeeper_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "charge_types" ADD COLUMN "is_loss_penalty" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "seed_tier" "member_seed_tier";--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "seed_evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "seed_evaluated_by" uuid;--> statement-breakpoint
ALTER TABLE "member_charges" ADD COLUMN "is_loss_penalty_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_members_version_id_match_team_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."match_team_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_members_team_id_match_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."match_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_members_participant_id_match_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_team_versions" ADD CONSTRAINT "match_team_versions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_team_versions" ADD CONSTRAINT "match_team_versions_tier_locked_by_users_id_fk" FOREIGN KEY ("tier_locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_team_versions" ADD CONSTRAINT "match_team_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_version_id_match_team_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."match_team_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_team_participant_version_unique" ON "match_team_members" USING btree ("version_id","participant_id") WHERE "match_team_members"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "match_team_members_team_idx" ON "match_team_members" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_team_one_draft_unique" ON "match_team_versions" USING btree ("match_id") WHERE "match_team_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "match_team_one_confirmed_unique" ON "match_team_versions" USING btree ("match_id") WHERE "match_team_versions"."status" = 'CONFIRMED';--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_seed_evaluated_by_users_id_fk" FOREIGN KEY ("seed_evaluated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES
  ('match_seed.view', 'Xem seed theo trận', 'Xem đánh giá Tier 1–4 và Thủ môn của người tham gia'),
  ('match_seed.manage', 'Quản lý seed theo trận', 'Đánh giá và khóa seed trước khi chia đội'),
  ('match_teams.view', 'Xem đội hình', 'Xem đội hình đã xác nhận của trận'),
  ('match_teams.manage', 'Quản lý chia đội', 'Tạo, chỉnh và xác nhận phiên bản đội hình'),
  ('match_form_report.view', 'Xem phong độ suy luận', 'Xem thống kê thắng thua suy luận từ khoản phạt')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission_key", "allowed") VALUES
  ('ADMIN', 'match_seed.view', true),
  ('ADMIN', 'match_seed.manage', true),
  ('ADMIN', 'match_teams.view', true),
  ('ADMIN', 'match_teams.manage', true),
  ('ADMIN', 'match_form_report.view', true),
  ('TREASURER', 'match_seed.view', true),
  ('TREASURER', 'match_seed.manage', true),
  ('TREASURER', 'match_teams.view', true),
  ('TREASURER', 'match_teams.manage', true),
  ('TREASURER', 'match_form_report.view', true),
  ('MEMBER', 'match_seed.view', true),
  ('MEMBER', 'match_seed.manage', false),
  ('MEMBER', 'match_teams.view', true),
  ('MEMBER', 'match_teams.manage', false),
  ('MEMBER', 'match_form_report.view', false)
ON CONFLICT ("role", "permission_key") DO UPDATE SET "allowed" = EXCLUDED."allowed";
--> statement-breakpoint
UPDATE "charge_types"
SET "is_loss_penalty" = true
WHERE lower("name") = lower('Mời nước');
--> statement-breakpoint
UPDATE "member_charges" AS charge
SET "is_loss_penalty_snapshot" = true
FROM "charge_types" AS charge_type
WHERE charge."charge_type_id" = charge_type."id"
  AND charge_type."is_loss_penalty" = true
  AND charge."match_id" IS NOT NULL;
