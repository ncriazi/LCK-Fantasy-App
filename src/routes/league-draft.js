import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  buildDraftState,
  DRAFTABLE_PLAYER_ROLES,
  formatTeamDraftRoster,
  getSnakeTeamId,
  PLAYER_ROLE_TO_SLOT_FIELD,
  ROSTER_SLOT_COUNT,
  TEAM_ROSTER_INCLUDE,
} from "../lib/draft-utils.js";
import { getLeagueMembership, shuffle } from "../lib/league-utils.js";

const router = Router();

const DRAFT_PICK_INCLUDE = {
  draftPicks: {
    orderBy: {
      overallPick: "asc",
    },
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
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

function buildLeagueUpdateAfterPick(league) {
  const teamCount = league.draftOrderEntries.length;
  const totalPicks = teamCount * ROSTER_SLOT_COUNT;
  const filledSlotCount =
    league.teams
      .flatMap((team) => [
        team.topPlayerId,
        team.junglePlayerId,
        team.midPlayerId,
        team.botPlayerId,
        team.supportPlayerId,
        team.defenseOrgId,
      ])
      .filter(Boolean).length + 1;
  const nextPickNumber = (league.currentPickNumber ?? 1) + 1;

  if (filledSlotCount >= totalPicks) {
    return {
      isDrafted: true,
      currentPickNumber: totalPicks,
      currentRound: Math.ceil(totalPicks / teamCount),
      currentTeamOnClockId: null,
    };
  }

  const nextRound = Math.floor((nextPickNumber - 1) / teamCount) + 1;
  const pickInRound = ((nextPickNumber - 1) % teamCount) + 1;
  const nextTeamId = getSnakeTeamId(league.draftOrderEntries, nextRound, pickInRound);

  return {
    currentPickNumber: nextPickNumber,
    currentRound: nextRound,
    currentTeamOnClockId: nextTeamId,
  };
}

async function finalizeDraftPick(tx, league, currentTeam, pickedSlot, pickedAsset) {
  const pickedPlayerId = pickedSlot === "defense" ? null : pickedAsset.id;
  const pickedOrganizationId = pickedSlot === "defense" ? pickedAsset.id : null;

  await tx.draftPick.create({
    data: {
      leagueId: league.id,
      teamId: currentTeam.id,
      round: league.currentRound ?? 1,
      overallPick: league.currentPickNumber ?? 1,
      slot: pickedSlot,
      playerId: pickedPlayerId,
      organizationId: pickedOrganizationId,
    },
  });

  const updatedLeague = await tx.league.update({
    where: { id: league.id },
    data: buildLeagueUpdateAfterPick(league),
    include: {
      currentTeamOnClock: {
        select: {
          id: true,
          name: true,
        },
      },
      draftOrderEntries: {
        orderBy: {
          pickPosition: "asc",
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      ...DRAFT_PICK_INCLUDE,
      ...TEAM_ROSTER_INCLUDE,
    },
  });

  return {
    pick: {
      teamId: currentTeam.id,
      teamName: currentTeam.name,
      slot: pickedSlot,
      asset: pickedAsset,
    },
    draft: buildDraftState(updatedLeague),
    teams: updatedLeague.teams.map(formatTeamDraftRoster),
  };
}

async function getDraftLeagueState(tx, leagueId) {
  return tx.league.findUnique({
    where: { id: leagueId },
    include: {
      currentTeamOnClock: {
        select: {
          id: true,
          name: true,
          userId: true,
        },
      },
      draftOrderEntries: {
        orderBy: {
          pickPosition: "asc",
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              userId: true,
            },
          },
        },
      },
      ...TEAM_ROSTER_INCLUDE,
    },
  });
}

async function makeDraftPickForLeague(
  tx,
  leagueId,
  actorUserId,
  { playerId, organizationId, allowCommissionerOverride = false },
) {
  const league = await getDraftLeagueState(tx, leagueId);

  if (!league) {
    return { status: 404, body: { error: "League not found" } };
  }

  if (league.draftType !== "snake") {
    return {
      status: 400,
      body: { error: "Only snake leagues use draft picks" },
    };
  }

  if (!league.draftStartedAt || !league.currentTeamOnClockId) {
    return { status: 400, body: { error: "Draft has not started" } };
  }

  if (league.isDrafted) {
    return { status: 409, body: { error: "Draft is already complete" } };
  }

  const actorMembership = league.teams.find((team) => team.userId === actorUserId);
  if (!actorMembership) {
    return { status: 403, body: { error: "You do not have access to this league draft" } };
  }

  if (
    !allowCommissionerOverride &&
    (!league.currentTeamOnClock || league.currentTeamOnClock.userId !== actorUserId)
  ) {
    return { status: 403, body: { error: "It is not your turn to pick" } };
  }

  if (
    allowCommissionerOverride &&
    league.commissionerId !== actorUserId &&
    (!league.currentTeamOnClock || league.currentTeamOnClock.userId !== actorUserId)
  ) {
    return { status: 403, body: { error: "Only the commissioner can auto-pick for other teams" } };
  }

  const currentTeam = league.teams.find((team) => team.id === league.currentTeamOnClockId);
  if (!currentTeam) {
    return { status: 500, body: { error: "Current draft team could not be found" } };
  }

  if (playerId) {
    const player = await tx.lckPlayer.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        name: true,
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!player) {
      return { status: 404, body: { error: "Player not found" } };
    }

    const slotField = PLAYER_ROLE_TO_SLOT_FIELD[player.role];
    if (!slotField) {
      return { status: 400, body: { error: "That player role cannot be drafted" } };
    }

    if (currentTeam[slotField]) {
      return { status: 409, body: { error: `The ${player.role} slot is already filled` } };
    }

    const existingPlayerTeam = league.teams.find(
      (team) => team.id !== currentTeam.id && team[slotField] === player.id,
    );

    if (existingPlayerTeam) {
      return { status: 409, body: { error: "That player is already drafted in this league" } };
    }

    await tx.fantasyTeam.update({
      where: { id: currentTeam.id },
      data: {
        [slotField]: player.id,
      },
    });

    return {
      status: 200,
      body: await finalizeDraftPick(tx, league, currentTeam, player.role, player),
    };
  }

  const organization = await tx.lckOrganization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!organization) {
    return { status: 404, body: { error: "Organization not found" } };
  }

  if (currentTeam.defenseOrgId) {
    return { status: 409, body: { error: "The defense slot is already filled" } };
  }

  const existingDefenseTeam = league.teams.find(
    (team) => team.id !== currentTeam.id && team.defenseOrgId === organization.id,
  );

  if (existingDefenseTeam) {
    return { status: 409, body: { error: "That defense is already drafted in this league" } };
  }

  await tx.fantasyTeam.update({
    where: { id: currentTeam.id },
    data: {
      defenseOrgId: organization.id,
    },
  });

  return {
    status: 200,
    body: await finalizeDraftPick(tx, league, currentTeam, "defense", organization),
  };
}

async function autoDraftCurrentPick(tx, leagueId, actorUserId) {
  const league = await getDraftLeagueState(tx, leagueId);

  if (!league) {
    return { status: 404, body: { error: "League not found" } };
  }

  if (league.commissionerId !== actorUserId) {
    return { status: 403, body: { error: "Only the commissioner can auto-draft" } };
  }

  const currentTeam = league.teams.find((team) => team.id === league.currentTeamOnClockId);
  if (!currentTeam) {
    return { status: 400, body: { error: "Draft is not currently on the clock" } };
  }

  const roleOrder = ["top", "jungle", "mid", "bot", "support"];
  const openRole = roleOrder.find((role) => !currentTeam[PLAYER_ROLE_TO_SLOT_FIELD[role]]);

  if (openRole) {
    const takenIds = new Set(
      league.teams
        .flatMap((team) => [
          team.topPlayerId,
          team.junglePlayerId,
          team.midPlayerId,
          team.botPlayerId,
          team.supportPlayerId,
        ])
        .filter(Boolean),
    );

    const nextPlayer = await tx.lckPlayer.findFirst({
      where: {
        role: openRole,
        id: {
          notIn: [...takenIds],
        },
      },
      orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
      select: { id: true },
    });

    if (!nextPlayer) {
      return {
        status: 409,
        body: { error: `No available ${openRole} players remain for auto-draft` },
      };
    }

    return makeDraftPickForLeague(tx, leagueId, actorUserId, {
      playerId: nextPlayer.id,
      allowCommissionerOverride: true,
    });
  }

  if (!currentTeam.defenseOrgId) {
    const takenDefenseIds = new Set(
      league.teams.map((team) => team.defenseOrgId).filter(Boolean),
    );

    const nextDefense = await tx.lckOrganization.findFirst({
      where: {
        id: {
          notIn: [...takenDefenseIds],
        },
      },
      orderBy: { name: "asc" },
      select: { id: true },
    });

    if (!nextDefense) {
      return { status: 409, body: { error: "No defenses remain for auto-draft" } };
    }

    return makeDraftPickForLeague(tx, leagueId, actorUserId, {
      organizationId: nextDefense.id,
      allowCommissionerOverride: true,
    });
  }

  return { status: 409, body: { error: "Current team has no open draft slots" } };
}

router.post("/:leagueId/draft/start", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        teams: {
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
    });

    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    if (league.commissionerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the commissioner can start the draft" });
    }

    if (league.draftType !== "snake") {
      return res
        .status(400)
        .json({ error: "Only snake leagues can start a draft" });
    }

    if (league.draftStartedAt) {
      return res.status(409).json({ error: "Draft has already started" });
    }

    if (league.teams.length !== league.leagueSize) {
      return res.status(400).json({
        error: `Draft requires exactly ${league.leagueSize} teams before starting`,
      });
    }

    const randomizedTeams = shuffle(league.teams);

    const updatedLeague = await prisma.$transaction(async (tx) => {
      await tx.draftOrderEntry.deleteMany({
        where: { leagueId: league.id },
      });

      await tx.draftPick.deleteMany({
        where: { leagueId: league.id },
      });

      await tx.draftOrderEntry.createMany({
        data: randomizedTeams.map((team, index) => ({
          leagueId: league.id,
          teamId: team.id,
          pickPosition: index + 1,
        })),
      });

      return tx.league.update({
        where: { id: league.id },
        data: {
          isDrafted: false,
          draftStartedAt: new Date(),
          currentRound: 1,
          currentPickNumber: 1,
          currentTeamOnClockId: randomizedTeams[0].id,
        },
        include: {
          currentTeamOnClock: {
            select: {
              id: true,
              name: true,
            },
          },
          draftOrderEntries: {
            orderBy: {
              pickPosition: "asc",
            },
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          ...DRAFT_PICK_INCLUDE,
        },
      });
    });

    return res.json(buildDraftState(updatedLeague));
  } catch (error) {
    console.error("Failed to start draft:", error);
    return res.status(500).json({ error: "Failed to start draft" });
  }
});

router.get("/:leagueId/draft", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const membership = await getLeagueMembership(leagueId, req.user.id);

    if (!membership) {
      return res
        .status(403)
        .json({ error: "You do not have access to this league draft" });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        currentTeamOnClock: {
          select: {
            id: true,
            name: true,
          },
        },
        draftOrderEntries: {
          orderBy: {
            pickPosition: "asc",
          },
          include: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        ...DRAFT_PICK_INCLUDE,
      },
    });

    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    return res.json(buildDraftState(league));
  } catch (error) {
    console.error("Failed to fetch draft state:", error);
    return res.status(500).json({ error: "Failed to fetch draft state" });
  }
});

router.get("/:leagueId/draft/board", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const roleFilter = req.query.role?.toString().trim().toLowerCase();

    const membership = await getLeagueMembership(leagueId, req.user.id);

    if (!membership) {
      return res
        .status(403)
        .json({ error: "You do not have access to this league draft board" });
    }

    if (roleFilter && !DRAFTABLE_PLAYER_ROLES.has(roleFilter)) {
      return res.status(400).json({ error: "Invalid role filter" });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        currentTeamOnClock: {
          select: {
            id: true,
            name: true,
          },
        },
        draftOrderEntries: {
          orderBy: {
            pickPosition: "asc",
          },
          include: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        ...DRAFT_PICK_INCLUDE,
        ...TEAM_ROSTER_INCLUDE,
      },
    });

    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    const takenPlayerIds = new Set(
      league.teams
        .flatMap((team) => [
          team.topPlayerId,
          team.junglePlayerId,
          team.midPlayerId,
          team.botPlayerId,
          team.supportPlayerId,
        ])
        .filter(Boolean),
    );
    const takenDefenseIds = new Set(
      league.teams.map((team) => team.defenseOrgId).filter(Boolean),
    );

    const availablePlayers = await prisma.lckPlayer.findMany({
      where: {
        id: {
          notIn: [...takenPlayerIds],
        },
        ...(roleFilter ? { role: roleFilter } : {}),
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const availableDefenses = await prisma.lckOrganization.findMany({
      where: {
        id: {
          notIn: [...takenDefenseIds],
        },
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
      },
    });

    return res.json({
      draft: buildDraftState(league),
      teams: league.teams.map(formatTeamDraftRoster),
      availablePlayers,
      availableDefenses,
    });
  } catch (error) {
    console.error("Failed to fetch draft board:", error);
    return res.status(500).json({ error: "Failed to fetch draft board" });
  }
});

router.post("/:leagueId/draft/pick", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const playerId = req.body.playerId?.trim();
    const organizationId = req.body.organizationId?.trim();

    if ((!playerId && !organizationId) || (playerId && organizationId)) {
      return res.status(400).json({
        error: "Provide either playerId or organizationId for a draft pick",
      });
    }
    const result = await prisma.$transaction((tx) =>
      makeDraftPickForLeague(tx, leagueId, req.user.id, {
        playerId,
        organizationId,
      }),
    );

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Failed to make draft pick:", error);
    return res.status(500).json({ error: "Failed to make draft pick" });
  }
});

router.post("/:leagueId/draft/autopick", requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const result = await prisma.$transaction((tx) =>
      autoDraftCurrentPick(tx, leagueId, req.user.id),
    );

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Failed to auto-draft pick:", error);
    return res.status(500).json({ error: "Failed to auto-draft pick" });
  }
});

export default router;
