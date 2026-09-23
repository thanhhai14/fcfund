CREATE TABLE "debt_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"report_from_month" date NOT NULL,
	"report_to_month" date NOT NULL,
	"balance_snapshot" bigint NOT NULL,
	"debt_amount_snapshot" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_events" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_reminders_member_created_idx" ON "debt_reminders" USING btree ("club_id","member_id","created_at");--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES ('debt_reminders.send', 'Gửi nhắc nợ', 'Gửi lời nhắc nợ theo kỳ cho thành viên') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission_key", "allowed") VALUES ('ADMIN', 'debt_reminders.send', true), ('TREASURER', 'debt_reminders.send', true), ('ORGANIZER', 'debt_reminders.send', false), ('MEMBER', 'debt_reminders.send', false) ON CONFLICT ("role", "permission_key") DO NOTHING;
