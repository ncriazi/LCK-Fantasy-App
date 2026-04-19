import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const PLAYER_SLOT_FIELDS = {
  top: {
    idField: "topPlayerId",
    relationField: "topPlayer",
    expectedRole: "top",
  },
  jungle: {
    idField: "junglePlayerId",
    relationField: "junglePlayer",
    expectedRole: "jungle",
  },
  mid: {
    idField: "midPlayerId",
    relationField: "midPlayer",
    expectedRole: "mid",
  },
  bot: {
    idField: "botPlayerId",
    relationField: "botPlayer",
    expectedRole: "bot",
  },
  support: {
    idField: "supportPlayerId",
    relationField: "supportPlayer",
    expectedRole: "support",
  },
};
const DEFENSE_SLOT = {
  idField: "defenseOrgId",
  relationField: "defenseOrg",
};

function formatPlayerSlot(player) {
  if (!player) {
    return null;
  }

  return {
    id: player.id,
    name: player.name,
    role: player.role,
    organization: {
      id: player.organization.id,
      name: player.organization.name,
    },
  };
}

function formatDefenseSlot(organization) {
  if (!organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
  };
}

function buildRosterResponse(team) {
  return {
    id: team.id,
    name: team.name,
    league: team.league,
    roster: {
      top: formatPlayerSlot(team.topPlayer),
      jungle: formatPlayerSlot(team.junglePlayer),
      mid: formatPlayerSlot(team.midPlayer),
      bot: formatPlayerSlot(team.botPlayer),
      support: formatPlayerSlot(team.supportPlayer),
      defense: formatDefenseSlot(team.defenseOrg),
    },
  };
}

async function findTeamWithRoster(teamId) {
  return prisma.fantasyTeam.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      userId: true,
      leagueId: true,
      league: {
        select: {
          id: true,
          name: true,
          inviteCode: true,
        },
      },
      topPlayer: {
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
      junglePlayer: {
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
      midPlayer: {
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
      botPlayer: {
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
      supportPlayer: {
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
      defenseOrg: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

router.get("/:teamId/roster", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await findTeamWithRoster(teamId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const membership = await prisma.fantasyTeam.findUnique({
      where: {
        userId_leagueId: {
          userId: req.user.id,
          leagueId: team.leagueId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "You do not have access to this team" });
    }

    return res.json(buildRosterResponse(team));
  } catch (error) {
    console.error("Failed to fetch team roster:", error);
    return res.status(500).json({ error: "Failed to fetch team roster" });
  }
});

router.patch("/:teamId/roster", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const slot = req.body.slot?.trim().toLowerCase();
    const playerId = req.body.playerId?.trim();
    const organizationId = req.body.organizationId?.trim();
    const clear = req.body.clear === true;

    const team = await findTeamWithRoster(teamId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    if (team.userId !== req.user.id) {
      return res.status(403).json({ error: "You can only edit your own team" });
    }

    if (!slot) {
      return res.status(400).json({ error: "Roster slot is required" });
    }

    if (slot === "defense") {
      if (clear) {
        const updatedTeam = await prisma.fantasyTeam.update({
          where: { id: team.id },
          data: {
            [DEFENSE_SLOT.idField]: null,
          },
          select: {
            id: true,
            name: true,
            userId: true,
            leagueId: true,
            league: {
              select: {
                id: true,
                name: true,
                inviteCode: true,
              },
            },
            topPlayer: {
              select: {
                id: true,
                name: true,
                role: true,
                organization: { select: { id: true, name: true } },
              },
            },
            junglePlayer: {
              select: {
                id: true,
                name: true,
                role: true,
                organization: { select: { id: true, name: true } },
              },
            },
            midPlayer: {
              select: {
                id: true,
                name: true,
                role: true,
                organization: { select: { id: true, name: true } },
              },
            },
            botPlayer: {
              select: {
                id: true,
                name: true,
                role: true,
                organization: { select: { id: true, name: true } },
              },
            },
            supportPlayer: {
              select: {
                id: true,
                name: true,
                role: true,
                organization: { select: { id: true, name: true } },
              },
            },
            defenseOrg: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        return res.json(buildRosterResponse(updatedTeam));
      }

      if (!organizationId || playerId) {
        return res.status(400).json({
          error: "Defense assignments require organizationId only",
        });
      }

      const organization = await prisma.lckOrganization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const existingDefenseTeam = await prisma.fantasyTeam.findFirst({
        where: {
          leagueId: team.leagueId,
          defenseOrgId: organizationId,
          NOT: {
            id: team.id,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingDefenseTeam) {
        return res.status(409).json({
          error: "That defense is already assigned in this league",
        });
      }

      const updatedTeam = await prisma.fantasyTeam.update({
        where: { id: team.id },
        data: {
          [DEFENSE_SLOT.idField]: organizationId,
        },
        select: {
          id: true,
          name: true,
          userId: true,
          leagueId: true,
          league: {
            select: {
              id: true,
              name: true,
              inviteCode: true,
            },
          },
          topPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          junglePlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          midPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          botPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          supportPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          defenseOrg: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return res.json(buildRosterResponse(updatedTeam));
    }

    const slotConfig = PLAYER_SLOT_FIELDS[slot];

    if (!slotConfig) {
      return res.status(400).json({ error: "Invalid roster slot" });
    }

    if (clear) {
      const updatedTeam = await prisma.fantasyTeam.update({
        where: { id: team.id },
        data: {
          [slotConfig.idField]: null,
        },
        select: {
          id: true,
          name: true,
          userId: true,
          leagueId: true,
          league: {
            select: {
              id: true,
              name: true,
              inviteCode: true,
            },
          },
          topPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          junglePlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          midPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          botPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          supportPlayer: {
            select: {
              id: true,
              name: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
          defenseOrg: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return res.json(buildRosterResponse(updatedTeam));
    }

    if (!playerId || organizationId) {
      return res.status(400).json({
        error: "Player assignments require playerId only",
      });
    }

    const player = await prisma.lckPlayer.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    if (player.role !== slotConfig.expectedRole) {
      return res.status(400).json({
        error: `Only ${slotConfig.expectedRole} players can be assigned to ${slot}`,
      });
    }

    const existingPlayerTeam = await prisma.fantasyTeam.findFirst({
      where: {
        leagueId: team.leagueId,
        [slotConfig.idField]: playerId,
        NOT: {
          id: team.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingPlayerTeam) {
      return res.status(409).json({
        error: "That player is already assigned in this league",
      });
    }

    const updatedTeam = await prisma.fantasyTeam.update({
      where: { id: team.id },
      data: {
        [slotConfig.idField]: playerId,
      },
      select: {
        id: true,
        name: true,
        userId: true,
        leagueId: true,
        league: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
          },
        },
        topPlayer: {
          select: {
            id: true,
            name: true,
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
        junglePlayer: {
          select: {
            id: true,
            name: true,
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
        midPlayer: {
          select: {
            id: true,
            name: true,
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
        botPlayer: {
          select: {
            id: true,
            name: true,
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
        supportPlayer: {
          select: {
            id: true,
            name: true,
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
        defenseOrg: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json(buildRosterResponse(updatedTeam));
  } catch (error) {
    console.error("Failed to update team roster:", error);
    return res.status(500).json({ error: "Failed to update team roster" });
  }
});

export default router;
