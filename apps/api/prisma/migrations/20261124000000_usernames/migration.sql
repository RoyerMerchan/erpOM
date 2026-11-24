BEGIN;

ALTER TABLE "users" ADD COLUMN "username" VARCHAR(40);

-- Assign the email prefix to the earliest account when several accounts share it.
-- The UUID-based namespace keeps every fallback separate from those prefixes.
WITH candidates AS (
    SELECT "id", "created_at", lower(split_part("email", '@', 1) COLLATE "C") AS username
    FROM "users"
),
ranked AS (
    SELECT "id", username, row_number() OVER (PARTITION BY username ORDER BY "created_at", "id") AS position
    FROM candidates
)
UPDATE "users" AS account
SET "username" = CASE
    WHEN ranked.position = 1
        AND ranked.username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'
        AND ranked.username !~ '^u-[a-f0-9]{32}$'
        THEN ranked.username
    ELSE 'u-' || replace(account."id"::text, '-', '')
END
FROM ranked
WHERE account."id" = ranked."id";

-- A default allows the previous release to create accounts during the rollout or rollback.
ALTER TABLE "users"
    ALTER COLUMN "username" SET NOT NULL,
    ALTER COLUMN "username" SET DEFAULT (gen_random_uuid())::text,
    ADD CONSTRAINT "users_username_format_check"
        CHECK ("username" COLLATE "C" ~ '^[a-z0-9][a-z0-9._-]{2,39}$');

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

COMMIT;
