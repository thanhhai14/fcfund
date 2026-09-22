CREATE TYPE "public"."zalo_link_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(30) DEFAULT 'ZALO' NOT NULL,
	"provider_user_id" varchar(160) NOT NULL,
	"display_name" varchar(160),
	"avatar_url" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_user_unique" UNIQUE("provider","provider_user_id"),
	CONSTRAINT "auth_identities_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "zalo_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"provider_user_id" varchar(160) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"avatar_url" text,
	"status" "zalo_link_request_status" DEFAULT 'PENDING' NOT NULL,
	"approved_user_id" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_link_requests" ADD CONSTRAINT "zalo_link_requests_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_link_requests" ADD CONSTRAINT "zalo_link_requests_approved_user_id_users_id_fk" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_link_requests" ADD CONSTRAINT "zalo_link_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zalo_link_requests_pending_provider_unique" ON "zalo_link_requests" USING btree ("provider_user_id") WHERE "zalo_link_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "zalo_link_requests_club_status_idx" ON "zalo_link_requests" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "zalo_link_requests_provider_idx" ON "zalo_link_requests" USING btree ("provider_user_id");