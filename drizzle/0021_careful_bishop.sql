ALTER TABLE "matches" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "hidden_by" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;