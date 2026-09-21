CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'PARTIAL', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(80) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"entity_type" varchar(80),
	"entity_id" uuid,
	"dedupe_key" varchar(255) NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_events_dedupe_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expiration_time" bigint,
	"platform" varchar(40),
	"user_agent" text,
	"device_label" varchar(120),
	"enabled" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_events_user_status_idx" ON "notification_events" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "notification_events_created_idx" ON "notification_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_enabled_idx" ON "push_subscriptions" USING btree ("user_id","enabled");