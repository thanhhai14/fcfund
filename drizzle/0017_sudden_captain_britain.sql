CREATE TABLE "zalo_auth_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_secret_hash" varchar(64) NOT NULL,
	"oauth_state" varchar(160) NOT NULL,
	"pkce_verifier" varchar(160) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"provider_user_id" varchar(160),
	"display_name" varchar(160),
	"avatar_url" text,
	"club_id" uuid,
	"candidate_user_id" uuid,
	"link_request_id" uuid,
	"user_id" uuid,
	"failure_message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zalo_auth_handoffs" ADD CONSTRAINT "zalo_auth_handoffs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_auth_handoffs" ADD CONSTRAINT "zalo_auth_handoffs_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_auth_handoffs" ADD CONSTRAINT "zalo_auth_handoffs_link_request_id_zalo_link_requests_id_fk" FOREIGN KEY ("link_request_id") REFERENCES "public"."zalo_link_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_auth_handoffs" ADD CONSTRAINT "zalo_auth_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "zalo_auth_handoffs_state_unique" ON "zalo_auth_handoffs" USING btree ("oauth_state");--> statement-breakpoint
CREATE INDEX "zalo_auth_handoffs_status_expires_idx" ON "zalo_auth_handoffs" USING btree ("status","expires_at");