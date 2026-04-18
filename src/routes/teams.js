import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

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

router.get("/:teamId/roster", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await prisma.fantasyTeam.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
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

    return res.json({
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
    });
  } catch (error) {
    console.error("Failed to fetch team roster:", error);
    return res.status(500).json({ error: "Failed to fetch team roster" });
  }
});

export default router;
