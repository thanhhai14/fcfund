CREATE TYPE "public"."match_rsvp_source" AS ENUM('SELF', 'ORGANIZER');--> statement-breakpoint
CREATE TYPE "public"."match_rsvp_status" AS ENUM('GOING', 'NOT_GOING');--> statement-breakpoint
CREATE TABLE "match_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "match_rsvp_status" NOT NULL,
	"goalkeeper_available" boolean DEFAULT false NOT NULL,
	"source" "match_rsvp_source" DEFAULT 'SELF' NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_rsvps_match_member_unique" UNIQUE("match_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "match_rsvps" ADD CONSTRAINT "match_rsvps_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rsvps" ADD CONSTRAINT "match_rsvps_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rsvps" ADD CONSTRAINT "match_rsvps_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_rsvps_match_status_idx" ON "match_rsvps" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX "match_rsvps_member_idx" ON "match_rsvps" USING btree ("member_id");