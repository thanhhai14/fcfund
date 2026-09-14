UPDATE "charge_types"
SET "report_next_month" = true
WHERE lower("name") = lower('Trận lẻ');--> statement-breakpoint
UPDATE "member_charges" AS charge
SET "report_next_month_snapshot" = true
FROM "charge_types" AS charge_type
WHERE charge."charge_type_id" = charge_type."id"
  AND lower(charge_type."name") = lower('Trận lẻ');
