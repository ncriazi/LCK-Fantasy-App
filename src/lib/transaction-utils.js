import { prisma } from "./prisma.js";

export const PLAYER_SLOT_FIELDS = {
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

export const DEFENSE_SLOT = {
  idField: "defenseOrgId",
  relationField: "defenseOrg",
};

export const VALID_ROSTER_SLOTS = new Set([
  ...Object.keys(PLAYER_SLOT_FIELDS),
  "defense",
]);

export const TEAM_WITH_ROSTER_SELECT = {
  id: true,
  name: true,
  userId: true,
  leagueId: true,
  league: {
    select: {
      id: true,
      name: true,
      inviteCode: true,
      currentWeek: true,
      commissionerId: true,
    },
  },
  topPlayerId: true,
  junglePlayerId: true,
  midPlayerId: true,
  botPlayerId: true,
  supportPlayerId: true,
  defenseOrgId: true,
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
};

export function formatPlayerSlot(player) {
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

export function formatDefenseSlot(organization) {
  if (!organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
  };
}

export function buildRosterResponse(team) {
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

export async function findTeamWithRoster(teamId, tx = prisma) {
  return tx.fantasyTeam.findUnique({
    where: { id: teamId },
    select: TEAM_WITH_ROSTER_SELECT,
  });
}

export async function getLeagueMembership(leagueId, userId, tx = prisma) {
  return tx.fantasyTeam.findUnique({
    where: {
      userId_leagueId: {
        userId,
        leagueId,
      },
    },
    select: TEAM_WITH_ROSTER_SELECT,
  });
}

export function getSlotConfig(slot) {
  if (slot === "defense") {
    return DEFENSE_SLOT;
  }

  return PLAYER_SLOT_FIELDS[slot] ?? null;
}

export function getCurrentAssetId(team, slot) {
  const slotConfig = getSlotConfig(slot);
  if (!slotConfig) {
    return null;
  }

  return team[slotConfig.idField] ?? null;
}

export function getCurrentAsset(team, slot) {
  const slotConfig = getSlotConfig(slot);
  if (!slotConfig) {
    return null;
  }

  return team[slotConfig.relationField] ?? null;
}
