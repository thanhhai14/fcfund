CREATE TYPE "public"."activity_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RESET_PASSWORD', 'COMMENT');--> statement-breakpoint
CREATE TYPE "public"."charge_calculation" AS ENUM('MONTHLY', 'OCCURRENCE');--> statement-breakpoint
CREATE TYPE "public"."charge_source" AS ENUM('AUTO_MONTHLY', 'MANUAL', 'MATCH', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."fund_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."fund_transaction_kind" AS ENUM('MEMBER_PAYMENT', 'OTHER_INCOME', 'EXPENSE', 'OPENING_BALANCE', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'TREASURER', 'MEMBER');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "activity_action" NOT NULL,
	"message" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"calculation" charge_calculation NOT NULL,
	"default_amount" bigint DEFAULT 0 NOT NULL,
	"icon_name" varchar(100) DEFAULT 'wallet' NOT NULL,
	"icon_style" varchar(40) DEFAULT 'solid' NOT NULL,
	"color" varchar(20) DEFAULT '#2e7d58',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charge_types_club_name_unique" UNIQUE("club_id","name"),
	CONSTRAINT "charge_types_amount_nonnegative" CHECK ("charge_types"."default_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"logo_url" text,
	"qr_url" text,
	"bank_name" varchar(160),
	"bank_account_number" varchar(80),
	"bank_account_holder" varchar(160),
	"timezone" varchar(80) DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"direction" "fund_direction" NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_categories_club_name_direction_unique" UNIQUE("club_id","name","direction")
);
--> statement-breakpoint
CREATE TABLE "fund_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"direction" "fund_direction" NOT NULL,
	"kind" "fund_transaction_kind" NOT NULL,
	"category_id" uuid,
	"member_id" uuid,
	"match_id" uuid,
	"amount" bigint NOT NULL,
	"transaction_date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "fund_transactions_amount_positive" CHECK ("fund_transactions"."amount" > 0),
	CONSTRAINT "member_payment_identity" CHECK ("fund_transactions"."kind" <> 'MEMBER_PAYMENT' OR ("fund_transactions"."member_id" IS NOT NULL AND "fund_transactions"."direction" = 'IN'))
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"member_id" uuid,
	"guest_name" varchar(160),
	"note" text,
	CONSTRAINT "participant_identity_required" CHECK ("match_participants"."member_id" IS NOT NULL OR "match_participants"."guest_name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"played_on" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "member_charge_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"custom_amount" bigint,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_amount_nonnegative" CHECK ("member_charge_assignments"."custom_amount" IS NULL OR "member_charge_assignments"."custom_amount" >= 0),
	CONSTRAINT "assignments_valid_range" CHECK ("member_charge_assignments"."valid_until" IS NULL OR "member_charge_assignments"."valid_until" >= "member_charge_assignments"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "member_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"assignment_id" uuid,
	"match_id" uuid,
	"source" charge_source NOT NULL,
	"charge_date" date NOT NULL,
	"period_month" date,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" bigint NOT NULL,
	"total_amount" bigint NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "member_charges_quantity_positive" CHECK ("member_charges"."quantity" > 0),
	CONSTRAINT "member_charges_amount_nonnegative" CHECK ("member_charges"."unit_amount" >= 0 AND "member_charges"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(24) NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_on" date,
	"left_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_club_code_unique" UNIQUE("club_id","code")
);
--> statement-breakpoint
CREATE TABLE "monthly_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_month" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "job_status" DEFAULT 'RUNNING' NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	CONSTRAINT "monthly_job_runs_period_month_unique" UNIQUE("period_month")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" "user_role" NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "role_permissions_role_permission_key_pk" PRIMARY KEY("role","permission_key")
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"user_id" uuid NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"allowed" boolean NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_overrides_user_id_permission_key_pk" PRIMARY KEY("user_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid,
	"phone_normalized" varchar(24) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_categories" ADD CONSTRAINT "fund_categories_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_category_id_fund_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fund_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charge_assignments" ADD CONSTRAINT "member_charge_assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charge_assignments" ADD CONSTRAINT "member_charge_assignments_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charge_assignments" ADD CONSTRAINT "member_charge_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_assignment_id_member_charge_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."member_charge_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_charges" ADD CONSTRAINT "member_charges_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity_date_idx" ON "activity_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "fund_transactions_member_date_idx" ON "fund_transactions" USING btree ("member_id","transaction_date");--> statement-breakpoint
CREATE INDEX "fund_transactions_club_date_direction_idx" ON "fund_transactions" USING btree ("club_id","transaction_date","direction");--> statement-breakpoint
CREATE INDEX "match_participants_match_idx" ON "match_participants" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participant_member_unique" ON "match_participants" USING btree ("match_id","member_id") WHERE "match_participants"."member_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "matches_club_date_idx" ON "matches" USING btree ("club_id","played_on");--> statement-breakpoint
CREATE INDEX "assignments_member_idx" ON "member_charge_assignments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "assignments_effective_idx" ON "member_charge_assignments" USING btree ("valid_from","valid_until","is_active");--> statement-breakpoint
CREATE INDEX "member_charges_member_date_idx" ON "member_charges" USING btree ("member_id","charge_date");--> statement-breakpoint
CREATE INDEX "member_charges_type_period_idx" ON "member_charges" USING btree ("charge_type_id","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "member_charges_auto_month_unique" ON "member_charges" USING btree ("assignment_id","period_month") WHERE "member_charges"."source" = 'AUTO_MONTHLY' AND "member_charges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "members_club_status_idx" ON "members" USING btree ("club_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_member_unique" ON "users" USING btree ("member_id") WHERE "users"."member_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_club_role_idx" ON "users" USING btree ("club_id","role");