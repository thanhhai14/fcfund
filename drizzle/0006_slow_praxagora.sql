ALTER TYPE "public"."user_role" RENAME TO "user_role_old";
--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'TREASURER', 'ORGANIZER', 'MEMBER');
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."user_role" USING "role"::text::"public"."user_role";
--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "role" TYPE "public"."user_role" USING "role"::text::"public"."user_role";
--> statement-breakpoint
DROP TYPE "public"."user_role_old";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission_key", "allowed")
SELECT
  'MEMBER'::"public"."user_role",
  "key",
  "key" IN (
    'dashboard.view',
    'members.view',
    'member_profile.edit_own',
    'charges.view_own',
    'charges.view_all',
    'payments.view_own',
    'payments.view_all',
    'expenses.view',
    'matches.view',
    'match_seed.view',
    'match_teams.view',
    'match_form_report.view',
    'club_balance.view',
    'member_balances.view_all',
    'audit.view'
  )
FROM "permissions"
ON CONFLICT ("role", "permission_key") DO UPDATE SET "allowed" = EXCLUDED."allowed";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission_key", "allowed")
SELECT
  'ORGANIZER'::"public"."user_role",
  "key",
  "key" IN (
    'dashboard.view',
    'members.view',
    'member_profile.edit_own',
    'charges.view_own',
    'charges.view_all',
    'payments.view_own',
    'payments.view_all',
    'expenses.view',
    'matches.view',
    'matches.manage',
    'match_seed.view',
    'match_seed.manage',
    'match_teams.view',
    'match_teams.manage',
    'match_form_report.view',
    'club_balance.view',
    'member_balances.view_all',
    'audit.view'
  )
FROM "permissions"
ON CONFLICT ("role", "permission_key") DO UPDATE SET "allowed" = EXCLUDED."allowed";
