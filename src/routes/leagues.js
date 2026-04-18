import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeInviteCode(inviteCode) {
  return inviteCode?.trim().toUpperCase();
}

function generateInviteCode() {
  let code = "";

  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_CHARSET.length);
    code += INVITE_CODE_CHARSET[randomIndex];
  }

  return code;
}

async function createUniqueInviteCode() {
  while (true) {
    const inviteCode = generateInviteCode();
    const existingLeague = await prisma.league.findUnique({
      where: { inviteCode },
    });

    if (!existingLeague) {
      return inviteCode;
    }
  }
}

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const memberships = await prisma.fantasyTeam.findMany({
      where: {
        userId: req.user.id,
      },
      select: {
        id: true,
        name: true,
        league: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            leagueSize: true,
            draftType: true,
            draftFormat: true,
            isDrafted: true,
            commissionerId: true,
          },
        },
      },
      orderBy: {
        league: {
          name: "asc",
        },
      },
    });

    const leagues = memberships.map((membership) => ({
      id: membership.league.id,
      name: membership.league.name,
      inviteCode: membership.league.inviteCode,
      leagueSize: membership.league.leagueSize,
      draftType: membership.league.draftType,
      draftFormat: membership.league.draftFormat,
      isDrafted: membership.league.isDrafted,
      isCommissioner: membership.league.commissionerId === req.user.id,
      team: {
        id: membership.id,
        name: membership.name,
      },
    }));

    return res.json(leagues);
  } catch (error) {
    console.error("Failed to fetch user leagues:", error);
    return res.status(500).json({ error: "Failed to fetch user leagues" });
  }
});

router.get("/by-code/:inviteCode", async (req, res) => {
  try {
    const inviteCode = normalizeInviteCode(req.params.inviteCode);

    if (!inviteCode || inviteCode.length !== INVITE_CODE_LENGTH) {
      return res.status(400).json({ error: "Valid invite code is required" });
    }

    const league = await prisma.league.findUnique({
      where: { inviteCode },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        leagueSize: true,
        commissioner: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    return res.json({
      id: league.id,
      name: league.name,
      inviteCode: league.inviteCode,
      leagueSize: league.leagueSize,
      commissionerUsername: league.commissioner.username,
    });
  } catch (error) {
    console.error("League lookup failed:", error);
    return res.status(500).json({ error: "League lookup failed" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const name = req.body.name?.trim();

    if (!name) {
      return res.status(400).json({ error: "League name is required" });
    }

    const inviteCode = await createUniqueInviteCode();
    const teamName = `Team ${req.user.username}`;

    const league = await prisma.league.create({
      data: {
        name,
        inviteCode,
        commissionerId: req.user.id,
        teams: {
          create: {
            name: teamName,
            userId: req.user.id,
          },
        },
      },
      include: {
        teams: true,
      },
    });

    return res.status(201).json(league);
  } catch (error) {
    console.error("League creation failed:", error);
    return res.status(500).json({ error: "League creation failed" });
  }
});

router.post("/join", requireAuth, async (req, res) => {
  try {
    const inviteCode = normalizeInviteCode(req.body.inviteCode);

    if (!inviteCode || inviteCode.length !== INVITE_CODE_LENGTH) {
      return res.status(400).json({ error: "Valid invite code is required" });
    }

    const league = await prisma.league.findUnique({
      where: { inviteCode },
    });

    if (!league) {
      return res.status(404).json({ error: "League not found" });
    }

    const existingTeam = await prisma.fantasyTeam.findUnique({
      where: {
        userId_leagueId: {
          userId: req.user.id,
          leagueId: league.id,
        },
      },
    });

    if (existingTeam) {
      return res.status(409).json({ error: "User already joined this league" });
    }

    const team = await prisma.fantasyTeam.create({
      data: {
        name: `Team ${req.user.username}`,
        userId: req.user.id,
        leagueId: league.id,
      },
    });

    return res.status(201).json({
      league: {
        id: league.id,
        name: league.name,
        inviteCode: league.inviteCode,
        leagueSize: league.leagueSize,
      },
      team,
    });
  } catch (error) {
    console.error("League join failed:", error);
    return res.status(500).json({ error: "League join failed" });
  }
});

export default router;
