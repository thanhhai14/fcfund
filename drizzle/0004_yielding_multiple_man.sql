CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid,
	"user_id" uuid,
	"blob_url" text NOT NULL,
	"pathname" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_owner_required" CHECK ("avatars"."member_id" IS NOT NULL OR "avatars"."user_id" IS NOT NULL),
	CONSTRAINT "avatars_file_size_positive" CHECK ("avatars"."file_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"bio" text,
	"nickname" varchar(100),
	"preferred_position" varchar(100),
	"preferred_foot" varchar(20),
	"shirt_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_shirt_number_range" CHECK ("member_profiles"."shirt_number" IS NULL OR ("member_profiles"."shirt_number" >= 0 AND "member_profiles"."shirt_number" <= 99))
);
--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_member_unique" ON "avatars" USING btree ("member_id") WHERE "avatars"."member_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_user_unique" ON "avatars" USING btree ("user_id") WHERE "avatars"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "avatars_club_idx" ON "avatars" USING btree ("club_id");
--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES
	('member_profile.edit_own', 'Sửa hồ sơ cá nhân', 'Sửa CV và avatar của thành viên đang liên kết')
ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission_key", "allowed") VALUES
	('ADMIN', 'member_profile.edit_own', true),
	('TREASURER', 'member_profile.edit_own', true),
	('MEMBER', 'member_profile.edit_own', true)
ON CONFLICT ("role", "permission_key") DO NOTHING;
