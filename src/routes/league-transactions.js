import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  DEFENSE_SLOT,
  getCurrentAsset,
  getCurrentAssetId,
  getLeagueMembership,
  getSlotConfig,
  PLAYER_SLOT_FIELDS,
  TEAM_WITH_ROSTER_SELECT,
  VALID_ROSTER_SLOTS,
} from "../lib/transaction-utils.js";
import {
  buildLeaderboard,
  buildMatchups,
  buildTeamWeekScore,
  calculateDefenseFantasyPoints,
  calculatePlayerFantasyPoints,
  roundScore,
  TEAM_SCORE_SELECT,
} from "../lib/scoring-utils.js";

const router = Router();

const WAIVER_STATUS = {
  PENDING: "pending",
  SUCCESSFUL: "successful",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const TRADE_STATUS = {
  PENDING_RECIPIENT: "pending_recipient",
  PENDING_COMMISSIONER: "pending_commissioner",
  APPROVED: "approved",
  REJECTED: "rejected",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

async function ensureWaiverPriorities(tx, leagueId) {
  const teams = await tx.fantasyTeam.findMany({
    where: { leagueId },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
    },
  });

  const priorities = await tx.waiverPriority.findMany({
    where: { leagueId },
    orderBy: {
      position: "asc",
    },
  });

  const existingTeamIds = new Set(priorities.map((priority) => priority.teamId));
  let nextPosition = priorities.length + 1;

  for (const team of teams) {
    if (!existingTeamIds.has(team.id)) {
      await tx.waiverPriority.create({
        data: {
          leagueId,
          teamId: team.id,
          position: nextPosition,
        },
      });
      nextPosition += 1;
    }
  }

  return tx.waiverPriority.findMany({
    where: { leagueId },
    orderBy: {
      position: "asc",
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

async function getLockedPlayerIds(tx, leagueId, week) {
  const states = await tx.weeklyPlayerState.findMany({
    where: {
      leagueId,
      week,
      OR: [{ played: true }, { points: { gt: 0 } }],
    },
    select: {
      playerId: true,
    },
  });

  return new Set(states.map((state) => state.playerId));
}

async function getLockedDefenseIds(tx, leagueId, week) {
  const states = await tx.weeklyDefenseState.findMany({
    where: {
      leagueId,
      week,
      OR: [{ played: true }, { points: { gt: 0 } }],
    },
    select: {
      organizationId: true,
    },
  });

  return new Set(states.map((state) => state.organizationId));
}

function isCurrentRosterAssetLocked(team, slot, lockedPlayers, lockedDefenses) {
  if (slot === "defense") {
    return Boolean(team.defenseOrgId) && lockedDefenses.has(team.defenseOrgId);
  }

  const slotConfig = PLAYER_SLOT_FIELDS[slot];
  if (!slotConfig) {
    return false;
  }

  const currentPlayerId = team[slotConfig.idField];
  return Boolean(currentPlayerId) && lockedPlayers.has(currentPlayerId);
}

function slotRequiresDefense(slot) {
  return slot === "defense";
}

async function getLeagueWithTeams(tx, leagueId) {
  return tx.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        orderBy: {
          name: "asc",
        },
      },
    },
  });
}

async function computeWeekScores(tx, leagueId, week, { persist = false } = {}) {
  const [teams, playerStates, defenseStates] = await Promise.all([
    tx.fantasyTeam.findMany({
      where: { leagueId },
      orderBy: { name: "asc" },
      select: TEAM_SCORE_SELECT,
    }),
    tx.weeklyPlayerState.findMany({
      where: { leagueId, week },
    }),
    tx.weeklyDefenseState.findMany({
      where: { leagueId, week },
    }),
  ]);

  const playerStateById = new Map(
    playerStates.map((state) => [state.playerId, state]),
  );
  const defenseStateById = new Map(
    defenseStates.map((state) => [state.organizationId, state]),
  );

  const scores = [];

  for (const team of teams) {
    const breakdown = buildTeamWeekScore(team, playerStateById, defenseStateById);
    const score = {
      teamId: team.id,
      teamName: team.name,
      week,
      ...breakdown,
    };

    scores.push(score);

    if (persist) {
      await tx.weeklyTeamScore.upsert({
        where: {
          leagueId_week_teamId: {
            leagueId,
            week,
            teamId: team.id,
          },
        },
        update: {
          ...breakdown,
          finalizedAt: new Date(),
        },
        create: {
          leagueId,
          week,
          teamId: team.id,
          ...breakdown,
          finalizedAt: new Date(),
        },
      });
    }
  }

  return { teams, scores };
}

async function getWeekScoresForDisplay(leagueId, week) {
  const [teams, storedScores] = await Promise.all([
    prisma.fantasyTeam.findMany({
      where: { leagueId },
      orderBy: { name: "asc" },
      select: TEAM_SCORE_SELECT,
    }),
    prisma.weeklyTeamScore.findMany({
      where: { leagueId, week },
      orderBy: {
        team: {
          name: "asc",
        },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  if (storedScores.length === teams.length && teams.length > 0) {
    return {
      teams,
      scores: storedScores.map((score) => ({
        teamId: score.teamId,
        teamName: score.team.name,
        week: score.week,
        topPoints: roundScore(score.topPoints),
        junglePoints: roundScore(score.junglePoints),
        midPoints: roundScore(score.midPoints),
        botPoints: roundScore(score.botPoints),
        supportPoints: roundScore(score.supportPoints),
        defensePoints: roundScore(score.defensePoints),
        totalPoints: roundScore(score.totalPoints),
      })),
      finalized: storedScores.every((score) => Boolean(score.finalizedAt)),
    };
  }

  const live = await computeWeekScores(prisma, leagueId, week, { persist: false });
  return {
    teams: live.teams,
    scores: live.scores,
    finalized: false,
  };
}

function isAssetRostered(teams, slot, assetId) {
  if (slot === "defense") {
    return teams.some((team) => team.defenseOrgId === assetId);
  }

  const slotConfig = PLAYER_SLOT_FIELDS[slot];
  return teams.some((team) => team[slotConfig.idField] === assetId);
}

async function executeTrade(tx, trade) {
  const proposerTeam = await tx.fantasyTeam.findUnique({
    where: { id: trade.proposerTeamId },
  });
  const recipientTeam = await tx.fantasyTeam.findUnique({
    where: { id: trade.recipientTeamId },
  });

  if (!proposerTeam || !recipientTeam) {
    return false;
  }

  const proposerSlotConfig = getSlotConfig(trade.proposerSlot);
  const recipientSlotConfig = getSlotConfig(trade.recipientSlot);

  if (!proposerSlotConfig || !recipientSlotConfig) {
    return false;
  }

  const proposerAssetId = getCurrentAssetId(proposerTeam, trade.proposerSlot);
  const recipientAssetId = getCurrentAssetId(recipientTeam, trade.recipientSlot);

  const expectedProposerAssetId = trade.proposerSlot === "defense"
    ? trade.proposerOrganizationId
    : trade.proposerPlayerId;
  const expectedRecipientAssetId = trade.recipientSlot === "defense"
    ? trade.recipientOrganizationId
    : trade.recipientPlayerId;

  if (
    proposerAssetId !== expectedProposerAssetId ||
    recipientAssetId !== expectedRecipientAssetId
  ) {
    return false;
  }

  await tx.fantasyTeam.update({
    where: { id: proposerTeam.id },
    data: {
      [proposerSlotConfig.idField]: expectedRecipientAssetId,
    },
  });

  await tx.fantasyTeam.update({
    where: { id: recipientTeam.id },
    data: {
      [recipientSlotConfig.idField]: expectedProposerAssetId,
    },
  });

  return true;
}

async function processApprovedTrades(tx, leagueId, currentWeek) {
  const lockedPlayers = await getLockedPlayerIds(tx, leagueId, currentWeek);
  const lockedDefenses = await getLockedDefenseIds(tx, leagueId, currentWeek);

  const trades = await tx.tradeProposal.findMany({
    where: {
      leagueId,
      status: TRADE_STATUS.APPROVED,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const trade of trades) {
    const proposerLocked = trade.proposerSlot === "defense"
      ? lockedDefenses.has(trade.proposerOrganizationId)
      : lockedPlayers.has(trade.proposerPlayerId);
    const recipientLocked = trade.recipientSlot === "defense"
      ? lockedDefenses.has(trade.recipientOrganizationId)
      : lockedPlayers.has(trade.recipientPlayerId);

    if (proposerLocked || recipientLocked) {
      continue;
    }

    const executed = await executeTrade(tx, trade);

    await tx.tradeProposal.update({
      where: { id: trade.id },
      data: executed
        ? {
            status: TRADE_STATUS.COMPLETED,
            completedAt: new Date(),
          }
        : {
            status: TRADE_STATUS.REJECTED,
            commissionerNote: "Trade could not be completed because roster ownership changed",
            commissionerReviewedAt: new Date(),
          },
    });
  }
}

async function rotateWaiverPriority(tx, leagueId, winningTeamId) {
  const priorities = await tx.waiverPriority.findMany({
    where: { leagueId },
    orderBy: {
      position: "asc",
    },
  });

  const winner = priorities.find((priority) => priority.teamId === winningTeamId);
  if (!winner) {
    return;
  }

  const reordered = priorities
    .filter((priority) => priority.teamId !== winningTeamId)
    .concat(winner);

  const offset = reordered.length + 5;

  for (let index = 0; index < reordered.length; index += 1) {
    await tx.waiverPriority.update({
      where: { id: reordered[index].id },
      data: {
        position: index + 1 + offset,
      },
    });
  }

  for (let index = 0; index < reordered.length; index += 1) {
    await tx.waiverPriority.update({
      where: { id: reordered[index].id },
      data: {
        position: index + 1,
      },
    });
  }
}

async function processWaiverClaims(tx, leagueId, currentWeek) {
  const league = await getLeagueWithTeams(tx, leagueId);
  if (!league) {
    return;
  }

  const lockedPlayers = await getLockedPlayerIds(tx, leagueId, currentWeek);
  const lockedDefenses = await getLockedDefenseIds(tx, leagueId, currentWeek);

  const priorities = await ensureWaiverPriorities(tx, leagueId);
  const priorityByTeamId = new Map(
    priorities.map((priority) => [priority.teamId, priority.position]),
  );
  const successfulTeamSlots = new Set();

  const claims = await tx.waiverClaim.findMany({
    where: {
      leagueId,
      status: WAIVER_STATUS.PENDING,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  claims.sort((a, b) => {
    const priorityA = priorityByTeamId.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const priorityB = priorityByTeamId.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  for (const claim of claims) {
    const team = await tx.fantasyTeam.findUnique({
      where: { id: claim.teamId },
    });

    if (!team) {
      await tx.waiverClaim.update({
        where: { id: claim.id },
        data: {
          status: WAIVER_STATUS.FAILED,
          resolutionNote: "Claiming team no longer exists",
          processedAt: new Date(),
        },
      });
      continue;
    }

    const teamSlotKey = `${team.id}:${claim.slot}`;
    if (successfulTeamSlots.has(teamSlotKey)) {
      await tx.waiverClaim.update({
        where: { id: claim.id },
        data: {
          status: WAIVER_STATUS.FAILED,
          resolutionNote: "A higher-priority claim for this slot already succeeded",
          processedAt: new Date(),
        },
      });
      continue;
    }

    if (isCurrentRosterAssetLocked(team, claim.slot, lockedPlayers, lockedDefenses)) {
      continue;
    }

    if (slotRequiresDefense(claim.slot)) {
      if (lockedDefenses.has(claim.organizationId)) {
        continue;
      }

      if (isAssetRostered(league.teams, "defense", claim.organizationId)) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: {
            status: WAIVER_STATUS.FAILED,
            resolutionNote: "Defense is no longer available",
            processedAt: new Date(),
          },
        });
        continue;
      }

      await tx.fantasyTeam.update({
        where: { id: team.id },
        data: {
          defenseOrgId: claim.organizationId,
        },
      });
    } else {
      const slotConfig = PLAYER_SLOT_FIELDS[claim.slot];

      if (!slotConfig) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: {
            status: WAIVER_STATUS.FAILED,
            resolutionNote: "Invalid waiver slot",
            processedAt: new Date(),
          },
        });
        continue;
      }

      if (lockedPlayers.has(claim.playerId)) {
        continue;
      }

      if (isAssetRostered(league.teams, claim.slot, claim.playerId)) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: {
            status: WAIVER_STATUS.FAILED,
            resolutionNote: "Player is no longer available",
            processedAt: new Date(),
          },
        });
        continue;
      }

      await tx.fantasyTeam.update({
        where: { id: team.id },
        data: {
          [slotConfig.idField]: claim.playerId,
        },
      });
    }

    await tx.waiverClaim.update({
      where: { id: claim.id },
      data: {
        status: WAIVER_STATUS.SUCCESSFUL,
        resolutionNote: "Claim processed successfully",
        processedAt: new Date(),
      },
    });

    successfulTeamSlots.add(teamSlotKey);
    await rotateWaiverPriority(tx, leagueId, team.id);

    const refreshedLeague = await getLeagueWithTeams(tx, leagueId);
    league.teams = refreshedLeague.teams;
  }
}

async function getLeagueOr403(leagueId, userId, res) {
  const membership = await getLeagueMembership(leagueId, userId);
  if (!membership) {
    res.status(403).json({ error: "You do not have access to this league" });
    return null;
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
  });

  if (!league) {
    res.status(404).json({ error: "League not found" });
    return null;
  }

  return { league, membership };
}

router.get("/:leagueId/waivers", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const access = await getLeagueOr403(leagueId, req.user.id, res);
    if (!access) {
      return;
    }

    await prisma.$transaction((tx) => ensureWaiverPriorities(tx, leagueId));

    const [priorities, claims, playerStates, defenseStates] = await Promise.all([
      prisma.waiverPriority.findMany({
        where: { leagueId },
        orderBy: {
          position: "asc",
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.waiverClaim.findMany({
        where: { leagueId },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          player: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.weeklyPlayerState.findMany({
        where: {
          leagueId,
          week: access.league.currentWeek,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      }),
      prisma.weeklyDefenseState.findMany({
        where: {
          leagueId,
          week: access.league.currentWeek,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    return res.json({
      currentWeek: access.league.currentWeek,
      priorities,
      claims,
      lockedPlayers: playerStates,
      lockedDefenses: defenseStates,
    });
  } catch (error) {
    console.error("Failed to fetch waiver queue:", error);
    return res.status(500).json({ error: "Failed to fetch waiver queue" });
  }
});

router.post("/:leagueId/waivers/claim", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const slot = req.body.slot?.trim().toLowerCase();
    const playerId = req.body.playerId?.trim();
    const organizationId = req.body.organizationId?.trim();

    const access = await getLeagueOr403(leagueId, req.user.id, res);
    if (!access) {
      return;
    }

    if (!VALID_ROSTER_SLOTS.has(slot)) {
      return res.status(400).json({ error: "Valid roster slot is required" });
    }

    if (slot === "defense") {
      if (!organizationId || playerId) {
        return res.status(400).json({
          error: "Defense waiver claims require organizationId only",
        });
      }

      const [organization, leagueWithTeams] = await Promise.all([
        prisma.lckOrganization.findUnique({ where: { id: organizationId } }),
        getLeagueWithTeams(prisma, leagueId),
      ]);

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      if (isAssetRostered(leagueWithTeams.teams, "defense", organizationId)) {
        return res.status(409).json({ error: "Defense is currently rostered" });
      }
    } else {
      const slotConfig = PLAYER_SLOT_FIELDS[slot];
      if (!playerId || organizationId) {
        return res.status(400).json({
          error: "Player waiver claims require playerId only",
        });
      }

      const [player, leagueWithTeams] = await Promise.all([
        prisma.lckPlayer.findUnique({ where: { id: playerId } }),
        getLeagueWithTeams(prisma, leagueId),
      ]);

      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (player.role !== slotConfig.expectedRole) {
        return res.status(400).json({
          error: `Only ${slotConfig.expectedRole} players can be claimed for ${slot}`,
        });
      }

      if (isAssetRostered(leagueWithTeams.teams, slot, playerId)) {
        return res.status(409).json({ error: "Player is currently rostered" });
      }
    }

    const existingClaim = await prisma.waiverClaim.findFirst({
      where: {
        leagueId,
        teamId: access.membership.id,
        slot,
        playerId: playerId ?? null,
        organizationId: organizationId ?? null,
        status: WAIVER_STATUS.PENDING,
      },
    });

    if (existingClaim) {
      return res.status(409).json({ error: "Matching waiver claim already exists" });
    }

    const claim = await prisma.waiverClaim.create({
      data: {
        leagueId,
        teamId: access.membership.id,
        week: access.league.currentWeek,
        slot,
        playerId,
        organizationId,
      },
    });

    return res.status(201).json(claim);
  } catch (error) {
    console.error("Failed to create waiver claim:", error);
    return res.status(500).json({ error: "Failed to create waiver claim" });
  }
});

router.post("/:leagueId/week/player-state", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { playerId } = req.body;
    const kills = Number(req.body.kills ?? 0);
    const assists = Number(req.body.assists ?? 0);
    const cs = Number(req.body.cs ?? 0);
    const visionScore = Number(req.body.visionScore ?? 0);
    const played = req.body.played === true || kills > 0 || assists > 0 || cs > 0 || visionScore > 0;
    const points = roundScore(
      calculatePlayerFantasyPoints({
        kills,
        assists,
        cs,
        visionScore,
      }),
    );

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    if (league.commissionerId !== req.user.id) {
      return res.status(403).json({ error: "Only the commissioner can update week state" });
    }

    const state = await prisma.weeklyPlayerState.upsert({
      where: {
        leagueId_week_playerId: {
          leagueId,
          week: league.currentWeek,
          playerId,
        },
      },
      update: {
        kills,
        assists,
        cs,
        visionScore,
        played,
        points,
      },
      create: {
        leagueId,
        week: league.currentWeek,
        playerId,
        kills,
        assists,
        cs,
        visionScore,
        played,
        points,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    return res.json(state);
  } catch (error) {
    console.error("Failed to update weekly player state:", error);
    return res.status(500).json({ error: "Failed to update weekly player state" });
  }
});

router.post("/:leagueId/week/defense-state", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { organizationId } = req.body;
    const towersAlive = Number(req.body.towersAlive ?? 0);
    const played = req.body.played === true || towersAlive > 0;
    const points = roundScore(
      calculateDefenseFantasyPoints({
        towersAlive,
      }),
    );

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    if (league.commissionerId !== req.user.id) {
      return res.status(403).json({ error: "Only the commissioner can update week state" });
    }

    const state = await prisma.weeklyDefenseState.upsert({
      where: {
        leagueId_week_organizationId: {
          leagueId,
          week: league.currentWeek,
          organizationId,
        },
      },
      update: {
        towersAlive,
        played,
        points,
      },
      create: {
        leagueId,
        week: league.currentWeek,
        organizationId,
        towersAlive,
        played,
        points,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json(state);
  } catch (error) {
    console.error("Failed to update weekly defense state:", error);
    return res.status(500).json({ error: "Failed to update weekly defense state" });
  }
});

router.post("/:leagueId/week/advance", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    if (league.commissionerId !== req.user.id) {
      return res.status(403).json({ error: "Only the commissioner can advance the week" });
    }

    const updatedLeague = await prisma.$transaction(async (tx) => {
      await computeWeekScores(tx, leagueId, league.currentWeek, { persist: true });

      const nextWeek = league.currentWeek + 1;

      await tx.league.update({
        where: { id: leagueId },
        data: {
          currentWeek: nextWeek,
        },
      });

      await ensureWaiverPriorities(tx, leagueId);
      await processApprovedTrades(tx, leagueId, nextWeek);
      await processWaiverClaims(tx, leagueId, nextWeek);

      return tx.league.findUnique({
        where: { id: leagueId },
        include: {
          waiverClaims: true,
          tradeProposals: true,
        },
      });
    });

    return res.json({
      leagueId: updatedLeague.id,
      currentWeek: updatedLeague.currentWeek,
      finalizedWeek: league.currentWeek,
      waiverClaimsProcessed: updatedLeague.waiverClaims.length,
      tradesTracked: updatedLeague.tradeProposals.length,
    });
  } catch (error) {
    console.error("Failed to advance week:", error);
    return res.status(500).json({ error: "Failed to advance week" });
  }
});

router.get("/:leagueId/matchups", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const requestedWeek = Number(req.query.week ?? 0);

    const access = await getLeagueOr403(leagueId, req.user.id, res);
    if (!access) {
      return;
    }

    const week =
      Number.isInteger(requestedWeek) && requestedWeek > 0
        ? requestedWeek
        : access.league.currentWeek;

    const { teams, scores, finalized } = await getWeekScoresForDisplay(leagueId, week);
    const scoreByTeamId = new Map(scores.map((score) => [score.teamId, score]));

    return res.json({
      week,
      finalized,
      matchups: buildMatchups(teams, week, scoreByTeamId),
    });
  } catch (error) {
    console.error("Failed to fetch matchups:", error);
    return res.status(500).json({ error: "Failed to fetch matchups" });
  }
});

router.get("/:leagueId/leaderboard", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const access = await getLeagueOr403(leagueId, req.user.id, res);
    if (!access) {
      return;
    }

    const [teams, weeklyScores] = await Promise.all([
      prisma.fantasyTeam.findMany({
        where: { leagueId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.weeklyTeamScore.findMany({
        where: { leagueId },
        orderBy: [{ week: "asc" }, { team: { name: "asc" } }],
      }),
    ]);

    return res.json({
      currentWeek: access.league.currentWeek,
      leaderboard: buildLeaderboard(teams, weeklyScores),
    });
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/:leagueId/trades", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const access = await getLeagueOr403(leagueId, req.user.id, res);
    if (!access) {
      return;
    }

    const trades = await prisma.tradeProposal.findMany({
      where: { leagueId },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        proposerTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        recipientTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        proposerPlayer: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        proposerOrganization: {
          select: {
            id: true,
            name: true,
          },
        },
        recipientPlayer: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        recipientOrganization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({
      currentWeek: access.league.currentWeek,
      trades,
    });
  } catch (error) {
    console.error("Failed to fetch trades:", error);
    return res.status(500).json({ error: "Failed to fetch trades" });
  }
});

router.post("/:leagueId/trades", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const recipientTeamId = req.body.recipientTeamId?.trim();
    const proposerSlot = req.body.proposerSlot?.trim().toLowerCase();
    const recipientSlot = req.body.recipientSlot?.trim().toLowerCase();

    const proposerTeam = await getLeagueMembership(leagueId, req.user.id);
    if (!proposerTeam) {
      return res.status(403).json({ error: "You do not have access to this league" });
    }

    if (!VALID_ROSTER_SLOTS.has(proposerSlot) || !VALID_ROSTER_SLOTS.has(recipientSlot)) {
      return res.status(400).json({ error: "Valid trade slots are required" });
    }

    if (proposerSlot !== recipientSlot) {
      return res.status(400).json({
        error: "Trades currently require matching slot types on both sides",
      });
    }

    if (proposerTeam.id === recipientTeamId) {
      return res.status(400).json({ error: "Cannot trade with your own team" });
    }

    const recipientTeam = await prisma.fantasyTeam.findUnique({
      where: { id: recipientTeamId },
      select: TEAM_WITH_ROSTER_SELECT,
    });

    if (!recipientTeam || recipientTeam.leagueId !== leagueId) {
      return res.status(404).json({ error: "Recipient team not found in this league" });
    }

    const proposerAsset = getCurrentAsset(proposerTeam, proposerSlot);
    const recipientAsset = getCurrentAsset(recipientTeam, recipientSlot);

    if (!proposerAsset || !recipientAsset) {
      return res.status(400).json({
        error: "Both teams must have an asset in the selected slot",
      });
    }

    const trade = await prisma.tradeProposal.create({
      data: {
        leagueId,
        proposerTeamId: proposerTeam.id,
        recipientTeamId: recipientTeam.id,
        proposerSlot,
        proposerPlayerId: proposerSlot === "defense" ? null : proposerAsset.id,
        proposerOrganizationId: proposerSlot === "defense" ? proposerAsset.id : null,
        recipientSlot,
        recipientPlayerId: recipientSlot === "defense" ? null : recipientAsset.id,
        recipientOrganizationId: recipientSlot === "defense" ? recipientAsset.id : null,
      },
    });

    return res.status(201).json(trade);
  } catch (error) {
    console.error("Failed to create trade proposal:", error);
    return res.status(500).json({ error: "Failed to create trade proposal" });
  }
});

router.post("/:leagueId/trades/:tradeId/respond", requireAuth, async (req, res) => {
  try {
    const { leagueId, tradeId } = req.params;
    const action = req.body.action?.trim().toLowerCase();

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be accept or reject" });
    }

    const trade = await prisma.tradeProposal.findUnique({
      where: { id: tradeId },
    });

    if (!trade || trade.leagueId !== leagueId) {
      return res.status(404).json({ error: "Trade not found" });
    }

    const membership = await getLeagueMembership(leagueId, req.user.id);
    if (!membership || membership.id !== trade.recipientTeamId) {
      return res.status(403).json({ error: "Only the recipient team can respond" });
    }

    if (trade.status !== TRADE_STATUS.PENDING_RECIPIENT) {
      return res.status(409).json({ error: "Trade is no longer awaiting recipient response" });
    }

    const updatedTrade = await prisma.tradeProposal.update({
      where: { id: trade.id },
      data: {
        status:
          action === "accept"
            ? TRADE_STATUS.PENDING_COMMISSIONER
            : TRADE_STATUS.REJECTED,
        recipientRespondedAt: new Date(),
      },
    });

    return res.json(updatedTrade);
  } catch (error) {
    console.error("Failed to respond to trade:", error);
    return res.status(500).json({ error: "Failed to respond to trade" });
  }
});

router.post("/:leagueId/trades/:tradeId/review", requireAuth, async (req, res) => {
  try {
    const { leagueId, tradeId } = req.params;
    const action = req.body.action?.trim().toLowerCase();
    const commissionerNote = req.body.commissionerNote?.trim() || null;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be approve or reject" });
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    if (league.commissionerId !== req.user.id) {
      return res.status(403).json({ error: "Only the commissioner can review trades" });
    }

    const trade = await prisma.tradeProposal.findUnique({
      where: { id: tradeId },
    });

    if (!trade || trade.leagueId !== leagueId) {
      return res.status(404).json({ error: "Trade not found" });
    }

    if (trade.status !== TRADE_STATUS.PENDING_COMMISSIONER) {
      return res.status(409).json({ error: "Trade is not awaiting commissioner review" });
    }

    if (action === "reject") {
      const rejectedTrade = await prisma.tradeProposal.update({
        where: { id: trade.id },
        data: {
          status: TRADE_STATUS.REJECTED,
          commissionerReviewedAt: new Date(),
          commissionerNote,
        },
      });

      return res.json(rejectedTrade);
    }

    const [lockedPlayers, lockedDefenses] = await Promise.all([
      getLockedPlayerIds(prisma, leagueId, league.currentWeek),
      getLockedDefenseIds(prisma, leagueId, league.currentWeek),
    ]);

    const proposerLocked = trade.proposerSlot === "defense"
      ? lockedDefenses.has(trade.proposerOrganizationId)
      : lockedPlayers.has(trade.proposerPlayerId);
    const recipientLocked = trade.recipientSlot === "defense"
      ? lockedDefenses.has(trade.recipientOrganizationId)
      : lockedPlayers.has(trade.recipientPlayerId);

    if (proposerLocked || recipientLocked) {
      const approvedTrade = await prisma.tradeProposal.update({
        where: { id: trade.id },
        data: {
          status: TRADE_STATUS.APPROVED,
          commissionerReviewedAt: new Date(),
          commissionerNote:
            commissionerNote ??
            "Approved and waiting for next week because one or more assets already played",
        },
      });

      return res.json(approvedTrade);
    }

    const completedTrade = await prisma.$transaction(async (tx) => {
      const executed = await executeTrade(tx, trade);

      return tx.tradeProposal.update({
        where: { id: trade.id },
        data: executed
          ? {
              status: TRADE_STATUS.COMPLETED,
              commissionerReviewedAt: new Date(),
              completedAt: new Date(),
              commissionerNote,
            }
          : {
              status: TRADE_STATUS.REJECTED,
              commissionerReviewedAt: new Date(),
              commissionerNote:
                commissionerNote ??
                "Trade could not be completed because roster ownership changed",
            },
      });
    });

    return res.json(completedTrade);
  } catch (error) {
    console.error("Failed to review trade:", error);
    return res.status(500).json({ error: "Failed to review trade" });
  }
});

export default router;
