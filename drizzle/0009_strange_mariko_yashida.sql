ALTER TYPE "public"."member_seed_tier" ADD VALUE 'TIER_5' BEFORE 'GOALKEEPER';--> statement-breakpoint
ALTER TYPE "public"."member_seed_tier" ADD VALUE 'TIER_6' BEFORE 'GOALKEEPER';--> statement-breakpoint
ALTER TYPE "public"."member_seed_tier" ADD VALUE 'TIER_7' BEFORE 'GOALKEEPER';--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "goalkeeper_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD COLUMN "goalkeeper_available_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD COLUMN "assigned_as_goalkeeper" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "match_participants" SET "goalkeeper_available" = true WHERE "seed_tier" = 'GOALKEEPER';--> statement-breakpoint
UPDATE "match_team_members" SET "goalkeeper_available_snapshot" = true, "assigned_as_goalkeeper" = true WHERE "seed_tier_snapshot" = 'GOALKEEPER';
