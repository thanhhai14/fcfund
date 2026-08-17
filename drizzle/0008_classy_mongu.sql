ALTER TABLE "match_team_members" ADD COLUMN "desired_positions_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "match_team_members" ADD COLUMN "player_strength_snapshot" varchar(20);--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "desired_positions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "player_strength" varchar(20);