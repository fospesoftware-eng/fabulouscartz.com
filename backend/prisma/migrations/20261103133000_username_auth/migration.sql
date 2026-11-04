-- Add a unique, lowercase corporate username to every user.
-- The field stays nullable at the storage level so legacy inserts that have not
-- been taught about usernames cannot fail; the API always writes a value.

ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Deterministic backfill from the email local-part (lowercased).
UPDATE "User"
SET "username" = lower(substr("email", 1, instr("email", '@') - 1));

-- Enforce the 3..32 character bounds. Short handles get a stable suffix.
UPDATE "User"
SET "username" = substr("username", 1, 30) || '_usr'
WHERE length("username") < 3;

UPDATE "User"
SET "username" = substr("username", 1, 32)
WHERE length("username") > 32;

-- Deduplicate collisions in a deterministic order (oldest account keeps the
-- clean handle, later accounts get _2, _3, ...).
WITH ranked AS (
  SELECT
    "id",
    "username" AS base,
    ROW_NUMBER() OVER (PARTITION BY lower("username") ORDER BY "createdAt", "id") AS rn
  FROM "User"
)
UPDATE "User"
SET "username" = (
  SELECT
    CASE
      WHEN r.rn = 1 THEN r.base
      ELSE substr(r.base, 1, 28) || '_' || r.rn
    END
  FROM ranked r
  WHERE r."id" = "User"."id"
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
