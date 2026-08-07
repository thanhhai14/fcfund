ALTER TABLE "users" ADD COLUMN "display_name" varchar(160);
--> statement-breakpoint
UPDATE "users" AS "u"
SET "display_name" = COALESCE(
  (SELECT "m"."full_name" FROM "members" AS "m" WHERE "m"."id" = "u"."member_id"),
  CASE "u"."role"
    WHEN 'ADMIN' THEN 'Quản trị viên'
    WHEN 'TREASURER' THEN 'Thủ quỹ'
    ELSE "u"."phone_normalized"
  END
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;
