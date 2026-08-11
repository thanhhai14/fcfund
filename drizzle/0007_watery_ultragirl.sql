ALTER TABLE "matches" ADD COLUMN "public_lineup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "public_lineup_token" varchar(64);--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "public_lineup_published_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "matches_public_lineup_token_unique" ON "matches" USING btree ("public_lineup_token") WHERE "matches"."public_lineup_token" IS NOT NULL;