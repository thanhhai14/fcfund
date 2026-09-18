UPDATE "match_team_versions" AS "version"
SET "initial_draw_snapshot" = jsonb_build_object(
  'runId', COALESCE("version"."random_key", 'legacy-' || "version"."id"::text),
  'source', 'LEGACY_FINAL_LINEUP',
  'teams', (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', "team"."id"::text,
          'index', "team"."team_index",
          'name', "team"."name",
          'color', COALESCE("team"."color", '#0B3558'),
          'goalkeeperCount', "team"."goalkeeper_count",
          'members', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'participantId', COALESCE("member"."participant_id"::text, 'legacy-member-' || "member"."id"::text),
                  'memberId', "member"."member_id"::text,
                  'name', "member"."display_name_snapshot",
                  'avatarVersion', NULL,
                  'seedTier', "member"."seed_tier_snapshot"::text,
                  'assignedAsGoalkeeper', "member"."assigned_as_goalkeeper",
                  'isLocked', "member"."is_locked"
                )
                ORDER BY "member"."display_order", "member"."id"
              ),
              '[]'::jsonb
            )
            FROM "match_team_members" AS "member"
            WHERE "member"."version_id" = "version"."id"
              AND "member"."team_id" = "team"."id"
          )
        )
        ORDER BY "team"."team_index"
      ),
      '[]'::jsonb
    )
    FROM "match_teams" AS "team"
    WHERE "team"."version_id" = "version"."id"
  )
)
WHERE "version"."initial_draw_snapshot" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "match_teams" AS "existing_team"
    WHERE "existing_team"."version_id" = "version"."id"
  );
