-- AlterTable
ALTER TABLE "WeeklyDefenseState" ADD COLUMN     "towersAlive" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WeeklyPlayerState" ADD COLUMN     "assists" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kills" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visionScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WeeklyTeamScore" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "topPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "junglePoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "midPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "botPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supportPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defensePoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyTeamScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyTeamScore_leagueId_week_teamId_key" ON "WeeklyTeamScore"("leagueId", "week", "teamId");

-- AddForeignKey
ALTER TABLE "WeeklyTeamScore" ADD CONSTRAINT "WeeklyTeamScore_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyTeamScore" ADD CONSTRAINT "WeeklyTeamScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
