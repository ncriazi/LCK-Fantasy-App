-- AlterTable
ALTER TABLE "League" ADD COLUMN     "draftFormat" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "draftType" TEXT NOT NULL DEFAULT 'snake',
ADD COLUMN     "leagueSize" INTEGER NOT NULL DEFAULT 8;
