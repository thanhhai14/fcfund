ALTER TABLE "charge_types" ADD COLUMN "report_next_month" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_charges" ADD COLUMN "report_next_month_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "member_charges"
SET "report_next_month_snapshot" = "is_loss_penalty_snapshot";--> statement-breakpoint
UPDATE "charge_types" AS charge_type
SET "report_next_month" = true
WHERE EXISTS (
  SELECT 1
  FROM "member_charges" AS charge
  WHERE charge."charge_type_id" = charge_type."id"
    AND charge."is_loss_penalty_snapshot" = true
);
