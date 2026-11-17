CREATE TABLE "acb_email_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" varchar(24) NOT NULL,
	"reason" text NOT NULL,
	"fingerprint" text,
	"amount" bigint,
	"transaction_date" date,
	"content" text,
	"member_id" uuid,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acb_email_message_unique" UNIQUE("club_id","mailbox","message_id")
);
--> statement-breakpoint
CREATE TABLE "acb_email_settings" (
	"club_id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(16) DEFAULT 'OFF' NOT NULL,
	"mailbox" text NOT NULL,
	"sender" text DEFAULT 'mailalert@acb.com.vn' NOT NULL,
	"subject" text DEFAULT 'ACB-Dich vu bao so du tu dong' NOT NULL,
	"account_pattern" text NOT NULL,
	"key_hash" text,
	"activated_at" timestamp with time zone,
	"last_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_transactions" ADD COLUMN "source" varchar(20) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "payment_reference" varchar(6) DEFAULT translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), '0123456789abcdef', 'ABCDEFGHJKLMNPQR') NOT NULL;--> statement-breakpoint
ALTER TABLE "acb_email_imports" ADD CONSTRAINT "acb_email_imports_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acb_email_imports" ADD CONSTRAINT "acb_email_imports_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acb_email_imports" ADD CONSTRAINT "acb_email_imports_transaction_id_fund_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."fund_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acb_email_settings" ADD CONSTRAINT "acb_email_settings_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acb_email_fingerprint_idx" ON "acb_email_imports" USING btree ("club_id","fingerprint");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_payment_reference_unique" UNIQUE("payment_reference");