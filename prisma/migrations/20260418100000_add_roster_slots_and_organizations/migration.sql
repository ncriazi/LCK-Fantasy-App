-- CreateTable
CREATE TABLE "LckOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "LckOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LckOrganization_name_key" ON "LckOrganization"("name");

-- AlterTable
ALTER TABLE "LckPlayer" ADD COLUMN "organizationId" TEXT;

-- Backfill organizations from existing player rows
INSERT INTO "LckOrganization" ("id", "name")
SELECT 'org_' || md5("teamName"), "teamName"
FROM "LckPlayer"
GROUP BY "teamName";

-- Backfill player organization ids from the old teamName field
UPDATE "LckPlayer" AS player
SET "organizationId" = organization."id"
FROM "LckOrganization" AS organization
WHERE player."teamName" = organization."name";

-- Make organization required and remove the old loose team name field
ALTER TABLE "LckPlayer" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "LckPlayer" DROP COLUMN "teamName";

-- Add roster slot columns to fantasy teams
ALTER TABLE "FantasyTeam"
ADD COLUMN "topPlayerId" TEXT,
ADD COLUMN "junglePlayerId" TEXT,
ADD COLUMN "midPlayerId" TEXT,
ADD COLUMN "botPlayerId" TEXT,
ADD COLUMN "supportPlayerId" TEXT,
ADD COLUMN "defenseOrgId" TEXT;

-- Drop the old generic roster join table
DROP TABLE "_TeamRoster";

-- AddForeignKey
ALTER TABLE "LckPlayer" ADD CONSTRAINT "LckPlayer_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "LckOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_topPlayerId_fkey"
FOREIGN KEY ("topPlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_junglePlayerId_fkey"
FOREIGN KEY ("junglePlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_midPlayerId_fkey"
FOREIGN KEY ("midPlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_botPlayerId_fkey"
FOREIGN KEY ("botPlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_supportPlayerId_fkey"
FOREIGN KEY ("supportPlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_defenseOrgId_fkey"
FOREIGN KEY ("defenseOrgId") REFERENCES "LckOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
