import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const PANDASCORE_API_TOKEN = process.env.PANDASCORE_API_TOKEN;
const PANDASCORE_BASE_URL = "https://api.pandascore.co";

const OFFICIAL_LCK_TEAMS = [
  { name: "Hanwha Life Esports", aliases: ["Hanwha Life Esports", "HLE"] },
  { name: "T1", aliases: ["T1"] },
  { name: "BNK FEARX", aliases: ["BNK FEARX", "BFX", "FearX"] },
  { name: "DN SOOPers", aliases: ["DN SOOPers", "DNS", "DN Freecs"] },
  { name: "HANJIN BRION", aliases: ["HANJIN BRION", "BRION", "BRO"] },
  { name: "Gen.G Esports", aliases: ["Gen.G Esports", "GEN", "Gen.G"] },
  { name: "Dplus KIA", aliases: ["Dplus KIA", "DK", "Damwon KIA"] },
  { name: "kt Rolster", aliases: ["kt Rolster", "KT"] },
  {
    name: "NONGSHIM RED FORCE",
    aliases: ["NONGSHIM RED FORCE", "NS", "Nongshim RedForce"],
  },
  { name: "KIWOOM DRX", aliases: ["KIWOOM DRX", "DRX", "KRX"] },
];

const ROLE_MAP = {
  top: "top",
  jungle: "jungle",
  jun: "jungle",
  jng: "jungle",
  mid: "mid",
  adc: "bot",
  bot: "bot",
  bottom: "bot",
  support: "support",
  sup: "support",
};

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function mapRole(rawRole) {
  const normalized = String(rawRole ?? "").trim().toLowerCase();
  return ROLE_MAP[normalized] ?? null;
}

function chooseBestTeamMatch(teams, aliases) {
  const normalizedAliases = aliases.map(normalizeText);

  return teams.find((team) => {
    const candidates = [
      team.name,
      team.acronym,
      team.slug,
      team.current_videogame?.name,
    ]
      .filter(Boolean)
      .map(normalizeText);

    return normalizedAliases.some((alias) => candidates.includes(alias));
  });
}

function chooseRosterPlayers(teamRecord) {
  const groupedByRole = new Map();
  const players = Array.isArray(teamRecord.players) ? teamRecord.players : [];

  for (const player of players) {
    const mappedRole = mapRole(
      player.role ??
        player.current_videogame?.position ??
        player.current_videogame?.role ??
        player.position,
    );

    if (!mappedRole) {
      continue;
    }

    const current = groupedByRole.get(mappedRole);
    if (!current) {
      groupedByRole.set(mappedRole, player);
      continue;
    }

    if (player.active === true && current.active !== true) {
      groupedByRole.set(mappedRole, player);
    }
  }

  return [...groupedByRole.entries()].map(([role, player]) => ({
    role,
    name: player.name?.trim(),
  }));
}

function buildQuery(params) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }

    query.set(key, String(value));
  }

  return query.toString();
}

async function pandaRequest(path, params = {}) {
  const query = buildQuery(params);
  const url = `${PANDASCORE_BASE_URL}${path}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PANDASCORE_API_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PandaScore request failed (${response.status}) for ${url}: ${errorText}`);
  }

  return response.json();
}

async function findLckTeamByAliases(aliases) {
  for (const alias of aliases) {
    const searchResults = await pandaRequest("/lol/teams", {
      "search[name]": alias,
      per_page: 10,
    });

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const bestMatch = chooseBestTeamMatch(searchResults, aliases);
      if (bestMatch) {
        return bestMatch;
      }
    }

    const filterResults = await pandaRequest("/lol/teams", {
      "filter[name]": alias,
      per_page: 10,
    });

    if (Array.isArray(filterResults) && filterResults.length > 0) {
      const bestMatch = chooseBestTeamMatch(filterResults, aliases);
      if (bestMatch) {
        return bestMatch;
      }
    }
  }

  return null;
}

async function getTeamWithPlayers(teamId) {
  return pandaRequest(`/teams/${teamId}`);
}

async function upsertOrganization(name) {
  const existing = await prisma.lckOrganization.findUnique({
    where: { name },
  });

  if (existing) {
    return existing;
  }

  return prisma.lckOrganization.create({
    data: { name },
  });
}

async function upsertRosterPlayer(organizationId, role, name) {
  const existing = await prisma.lckPlayer.findFirst({
    where: {
      organizationId,
      role,
    },
  });

  if (existing) {
    return prisma.lckPlayer.update({
      where: { id: existing.id },
      data: { name },
    });
  }

  return prisma.lckPlayer.create({
    data: {
      organizationId,
      role,
      name,
    },
  });
}

async function main() {
  if (!PANDASCORE_API_TOKEN) {
    throw new Error(
      "PANDASCORE_API_TOKEN is required. Add it to your .env before running the import.",
    );
  }

  const leagueCount = await prisma.league.count();
  if (leagueCount > 0) {
    console.warn(
      "Warning: leagues already exist in this database. Importing may rename starter rows for existing org/role pairs.",
    );
  }

  const importedSummary = [];

  for (const officialTeam of OFFICIAL_LCK_TEAMS) {
    console.log(`Looking up ${officialTeam.name}...`);
    const pandaTeam = await findLckTeamByAliases(officialTeam.aliases);

    if (!pandaTeam) {
      console.warn(`No PandaScore team match found for ${officialTeam.name}. Skipping.`);
      continue;
    }

    const detailedTeam = await getTeamWithPlayers(pandaTeam.id);
    const rosterPlayers = chooseRosterPlayers(detailedTeam);

    if (rosterPlayers.length === 0) {
      console.warn(`No roster players were returned for ${officialTeam.name}. Skipping.`);
      continue;
    }

    const organization = await upsertOrganization(officialTeam.name);

    for (const player of rosterPlayers) {
      if (!player.name || !player.role) {
        continue;
      }

      await upsertRosterPlayer(organization.id, player.role, player.name);
    }

    importedSummary.push({
      organization: officialTeam.name,
      players: rosterPlayers.map((player) => `${player.role}: ${player.name}`),
    });
  }

  console.log("\nImported LCK organizations and starters:");
  for (const entry of importedSummary) {
    console.log(`- ${entry.organization}`);
    for (const player of entry.players) {
      console.log(`  ${player}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
