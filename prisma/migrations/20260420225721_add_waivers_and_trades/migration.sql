-- AlterTable
ALTER TABLE "League" ADD COLUMN     "currentWeek" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "WaiverPriority" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WaiverPriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverClaim" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "playerId" TEXT,
    "organizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolutionNote" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlayerState" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WeeklyPlayerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyDefenseState" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WeeklyDefenseState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProposal" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "proposerTeamId" TEXT NOT NULL,
    "recipientTeamId" TEXT NOT NULL,
    "proposerSlot" TEXT NOT NULL,
    "proposerPlayerId" TEXT,
    "proposerOrganizationId" TEXT,
    "recipientSlot" TEXT NOT NULL,
    "recipientPlayerId" TEXT,
    "recipientOrganizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_recipient',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientRespondedAt" TIMESTAMP(3),
    "commissionerReviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "commissionerNote" TEXT,

    CONSTRAINT "TradeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaiverPriority_teamId_key" ON "WaiverPriority"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "WaiverPriority_leagueId_teamId_key" ON "WaiverPriority"("leagueId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "WaiverPriority_leagueId_position_key" ON "WaiverPriority"("leagueId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlayerState_leagueId_week_playerId_key" ON "WeeklyPlayerState"("leagueId", "week", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyDefenseState_leagueId_week_organizationId_key" ON "WeeklyDefenseState"("leagueId", "week", "organizationId");

-- AddForeignKey
ALTER TABLE "WaiverPriority" ADD CONSTRAINT "WaiverPriority_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverPriority" ADD CONSTRAINT "WaiverPriority_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "LckOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlayerState" ADD CONSTRAINT "WeeklyPlayerState_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlayerState" ADD CONSTRAINT "WeeklyPlayerState_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "LckPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyDefenseState" ADD CONSTRAINT "WeeklyDefenseState_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyDefenseState" ADD CONSTRAINT "WeeklyDefenseState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "LckOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_proposerTeamId_fkey" FOREIGN KEY ("proposerTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_recipientTeamId_fkey" FOREIGN KEY ("recipientTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_proposerPlayerId_fkey" FOREIGN KEY ("proposerPlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_proposerOrganizationId_fkey" FOREIGN KEY ("proposerOrganizationId") REFERENCES "LckOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_recipientPlayerId_fkey" FOREIGN KEY ("recipientPlayerId") REFERENCES "LckPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_recipientOrganizationId_fkey" FOREIGN KEY ("recipientOrganizationId") REFERENCES "LckOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
