CREATE TYPE "public"."match_stat_result" AS ENUM('WIN', 'LOSS', 'UNRANKED');--> statement-breakpoint
CREATE TYPE "public"."match_stat_source" AS ENUM('RECORDED', 'PENALTY_INFERRED');--> statement-breakpoint
CREATE TABLE "member_match_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"team_version_id" uuid,
	"team_id" uuid,
	"played_on" date NOT NULL,
	"team_count" integer,
	"placement" integer,
	"is_tied" boolean DEFAULT false NOT NULL,
	"result" "match_stat_result" NOT NULL,
	"source" "match_stat_source" NOT NULL,
	"placement_score" integer NOT NULL,
	"formula_version" integer DEFAULT 1 NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_match_stats_member_match_unique" UNIQUE("member_id","match_id"),
	CONSTRAINT "member_match_stats_team_placement_valid" CHECK (("member_match_stats"."team_count" IS NULL AND "member_match_stats"."placement" IS NULL) OR ("member_match_stats"."team_count" IS NOT NULL AND "member_match_stats"."placement" IS NOT NULL AND "member_match_stats"."team_count" >= 2 AND "member_match_stats"."placement" >= 1 AND "member_match_stats"."placement" <= "member_match_stats"."team_count")),
	CONSTRAINT "member_match_stats_score_range" CHECK ("member_match_stats"."placement_score" >= 0 AND "member_match_stats"."placement_score" <= 10000),
	CONSTRAINT "member_match_stats_formula_positive" CHECK ("member_match_stats"."formula_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "match_team_members" DROP CONSTRAINT "match_team_member_history_nonnegative";--> statement-breakpoint
ALTER TABLE "match_teams" DROP CONSTRAINT "match_team_counts_nonnegative";--> statement-breakpoint
ALTER TABLE "match_team_members" ADD COLUMN "form_score_snapshot" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD COLUMN "form_confidence_snapshot" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD COLUMN "inferred_match_count_snapshot" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_teams" ADD COLUMN "form_score_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_teams" ADD COLUMN "low_form_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "match_teams" SET "form_score_total" = "member_count" * 5000, "recent_loss_score" = "member_count" * 5000;--> statement-breakpoint
ALTER TABLE "member_match_stats" ADD CONSTRAINT "member_match_stats_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_match_stats" ADD CONSTRAINT "member_match_stats_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_match_stats" ADD CONSTRAINT "member_match_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_match_stats" ADD CONSTRAINT "member_match_stats_team_version_id_match_team_versions_id_fk" FOREIGN KEY ("team_version_id") REFERENCES "public"."match_team_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_match_stats" ADD CONSTRAINT "member_match_stats_team_id_match_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."match_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_match_stats" ADD CONSTRAINT "member_match_stats_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_match_stats_member_date_idx" ON "member_match_stats" USING btree ("member_id","played_on");--> statement-breakpoint
CREATE INDEX "member_match_stats_club_match_idx" ON "member_match_stats" USING btree ("club_id","match_id");--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_member_form_score_range" CHECK ("match_team_members"."form_score_snapshot" >= 0 AND "match_team_members"."form_score_snapshot" <= 10000);--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_member_form_confidence_range" CHECK ("match_team_members"."form_confidence_snapshot" >= 0 AND "match_team_members"."form_confidence_snapshot" <= 10000);--> statement-breakpoint
ALTER TABLE "match_team_members" ADD CONSTRAINT "match_team_member_history_nonnegative" CHECK ("match_team_members"."recent_match_count_snapshot" >= 0 AND "match_team_members"."recent_loss_count_snapshot" >= 0 AND "match_team_members"."inferred_match_count_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_team_counts_nonnegative" CHECK ("match_teams"."member_count" >= 0 AND "match_teams"."goalkeeper_count" >= 0 AND "match_teams"."form_score_total" >= 0 AND "match_teams"."low_form_count" >= 0);--> statement-breakpoint
WITH "team_results" AS (
	SELECT
		"mtv"."id" AS "team_version_id",
		"mtv"."match_id",
		"mt"."id" AS "team_id",
		"m"."club_id",
		"m"."played_on",
		"m"."created_by",
		COUNT(*) OVER (PARTITION BY "mtv"."id")::integer AS "team_count",
		CASE
			WHEN ("mtv"."metrics"->'placements'->>"mt"."name") ~ '^[0-9]+$'
			THEN ("mtv"."metrics"->'placements'->>"mt"."name")::integer
		END AS "placement"
	FROM "match_team_versions" "mtv"
	INNER JOIN "matches" "m" ON "m"."id" = "mtv"."match_id"
	INNER JOIN "match_teams" "mt" ON "mt"."version_id" = "mtv"."id"
	WHERE "mtv"."status" = 'CONFIRMED'
		AND "m"."deleted_at" IS NULL
		AND "mtv"."metrics" ? 'placements'
),
"scored_teams" AS (
	SELECT
		"team_results".*,
		COUNT(*) OVER (PARTITION BY "team_version_id", "placement") > 1 AS "is_tied"
	FROM "team_results"
	WHERE "placement" IS NOT NULL
		AND "team_count" >= 2
		AND "placement" BETWEEN 1 AND "team_count"
)
INSERT INTO "member_match_stats" (
	"club_id", "member_id", "match_id", "team_version_id", "team_id", "played_on",
	"team_count", "placement", "is_tied", "result", "source", "placement_score",
	"formula_version", "calculated_at", "created_by", "created_at", "updated_at"
)
SELECT
	"st"."club_id",
	"mtm"."member_id",
	"st"."match_id",
	"st"."team_version_id",
	"st"."team_id",
	"st"."played_on",
	"st"."team_count",
	"st"."placement",
	"st"."is_tied",
	CASE WHEN "st"."placement" = 1 THEN 'WIN'::"match_stat_result" ELSE 'LOSS'::"match_stat_result" END,
	'RECORDED'::"match_stat_source",
	ROUND((("st"."team_count" - "st"."placement")::numeric / ("st"."team_count" - 1)) * 10000)::integer,
	1,
	NOW(),
	"st"."created_by",
	NOW(),
	NOW()
FROM "scored_teams" "st"
INNER JOIN "match_team_members" "mtm" ON "mtm"."version_id" = "st"."team_version_id" AND "mtm"."team_id" = "st"."team_id"
WHERE "mtm"."member_id" IS NOT NULL
ON CONFLICT ("member_id", "match_id") DO NOTHING;--> statement-breakpoint
WITH "penalty_matches" AS (
	SELECT DISTINCT "mc"."match_id"
	FROM "member_charges" "mc"
	INNER JOIN "matches" "m" ON "m"."id" = "mc"."match_id"
	WHERE "mc"."is_loss_penalty_snapshot" = true
		AND "mc"."deleted_at" IS NULL
		AND "mc"."match_id" IS NOT NULL
		AND "m"."deleted_at" IS NULL
),
"legacy_results" AS (
	SELECT
		"m"."club_id",
		"mp"."member_id",
		"m"."id" AS "match_id",
		"m"."played_on",
		"m"."created_by",
		EXISTS (
			SELECT 1
			FROM "member_charges" "loss"
			WHERE "loss"."match_id" = "m"."id"
				AND "loss"."member_id" = "mp"."member_id"
				AND "loss"."is_loss_penalty_snapshot" = true
				AND "loss"."deleted_at" IS NULL
		) AS "lost"
	FROM "penalty_matches" "pm"
	INNER JOIN "matches" "m" ON "m"."id" = "pm"."match_id"
	INNER JOIN "match_participants" "mp" ON "mp"."match_id" = "m"."id"
	WHERE "mp"."member_id" IS NOT NULL
)
INSERT INTO "member_match_stats" (
	"club_id", "member_id", "match_id", "played_on", "is_tied", "result", "source",
	"placement_score", "formula_version", "calculated_at", "created_by", "created_at", "updated_at"
)
SELECT
	"club_id",
	"member_id",
	"match_id",
	"played_on",
	false,
	CASE WHEN "lost" THEN 'LOSS'::"match_stat_result" ELSE 'WIN'::"match_stat_result" END,
	'PENALTY_INFERRED'::"match_stat_source",
	CASE WHEN "lost" THEN 0 ELSE 10000 END,
	1,
	NOW(),
	"created_by",
	NOW(),
	NOW()
FROM "legacy_results"
ON CONFLICT ("member_id", "match_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES
	('match_form_report.view', 'Xem điểm phong độ', 'Xem kết quả gần đây, điểm phong độ và dữ liệu lịch sử suy luận')
ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description";
