export const PLAYER_SCORING = {
  kill: 1,
  assist: 0.5,
  csOrVision: 0.02,
};

export const DEFENSE_SCORING = {
  towerAlive: 0.5,
};

export const TEAM_SCORE_SELECT = {
  id: true,
  name: true,
  leagueId: true,
  topPlayerId: true,
  junglePlayerId: true,
  midPlayerId: true,
  botPlayerId: true,
  supportPlayerId: true,
  defenseOrgId: true,
};

export function calculatePlayerFantasyPoints({
  kills = 0,
  assists = 0,
  cs = 0,
  visionScore = 0,
}) {
  return (
    kills * PLAYER_SCORING.kill +
    assists * PLAYER_SCORING.assist +
    (cs + visionScore) * PLAYER_SCORING.csOrVision
  );
}

export function calculateDefenseFantasyPoints({ towersAlive = 0 }) {
  return towersAlive * DEFENSE_SCORING.towerAlive;
}

export function roundScore(value) {
  return Number(value.toFixed(2));
}

export function buildTeamWeekScore(team, playerStateById, defenseStateById) {
  const topPoints = roundScore(playerStateById.get(team.topPlayerId)?.points ?? 0);
  const junglePoints = roundScore(
    playerStateById.get(team.junglePlayerId)?.points ?? 0,
  );
  const midPoints = roundScore(playerStateById.get(team.midPlayerId)?.points ?? 0);
  const botPoints = roundScore(playerStateById.get(team.botPlayerId)?.points ?? 0);
  const supportPoints = roundScore(
    playerStateById.get(team.supportPlayerId)?.points ?? 0,
  );
  const defensePoints = roundScore(
    defenseStateById.get(team.defenseOrgId)?.points ?? 0,
  );

  const totalPoints = roundScore(
    topPoints +
      junglePoints +
      midPoints +
      botPoints +
      supportPoints +
      defensePoints,
  );

  return {
    topPoints,
    junglePoints,
    midPoints,
    botPoints,
    supportPoints,
    defensePoints,
    totalPoints,
  };
}

function rotateRoundRobin(teams) {
  if (teams.length <= 2) {
    return teams;
  }

  return [
    teams[0],
    teams[teams.length - 1],
    ...teams.slice(1, teams.length - 1),
  ];
}

export function getWeekMatchupPairs(teams, week) {
  if (teams.length === 0) {
    return [];
  }

  const normalizedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  if (normalizedTeams.length % 2 !== 0) {
    normalizedTeams.push(null);
  }

  const rounds = Math.max(normalizedTeams.length - 1, 1);
  let rotation = normalizedTeams;
  const targetRound = ((week - 1) % rounds + rounds) % rounds;

  for (let index = 0; index < targetRound; index += 1) {
    rotation = rotateRoundRobin(rotation);
  }

  const half = rotation.length / 2;
  const pairs = [];

  for (let index = 0; index < half; index += 1) {
    const homeTeam = rotation[index];
    const awayTeam = rotation[rotation.length - 1 - index];

    if (!homeTeam || !awayTeam) {
      continue;
    }

    pairs.push({
      homeTeam,
      awayTeam,
    });
  }

  return pairs;
}

export function buildMatchups(teams, week, scoreByTeamId = new Map()) {
  return getWeekMatchupPairs(teams, week).map((pair, index) => {
    const homeScore = scoreByTeamId.get(pair.homeTeam.id) ?? null;
    const awayScore = scoreByTeamId.get(pair.awayTeam.id) ?? null;

    let winnerTeamId = null;
    if (homeScore && awayScore) {
      if (homeScore.totalPoints > awayScore.totalPoints) {
        winnerTeamId = pair.homeTeam.id;
      } else if (awayScore.totalPoints > homeScore.totalPoints) {
        winnerTeamId = pair.awayTeam.id;
      }
    }

    return {
      matchupNumber: index + 1,
      week,
      homeTeam: {
        id: pair.homeTeam.id,
        name: pair.homeTeam.name,
      },
      awayTeam: {
        id: pair.awayTeam.id,
        name: pair.awayTeam.name,
      },
      homeScore,
      awayScore,
      winnerTeamId,
      isTie:
        Boolean(homeScore && awayScore) &&
        homeScore.totalPoints === awayScore.totalPoints,
    };
  });
}

export function buildLeaderboard(teams, weeklyScores) {
  const leaderboard = new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        weeksScored: 0,
      },
    ]),
  );

  const weeks = [...new Set(weeklyScores.map((score) => score.week))].sort((a, b) => a - b);

  for (const week of weeks) {
    const scoreByTeamId = new Map(
      weeklyScores
        .filter((score) => score.week === week)
        .map((score) => [score.teamId, score]),
    );

    for (const score of scoreByTeamId.values()) {
      const entry = leaderboard.get(score.teamId);
      entry.pointsFor = roundScore(entry.pointsFor + score.totalPoints);
      entry.weeksScored += 1;
    }

    for (const matchup of buildMatchups(teams, week, scoreByTeamId)) {
      if (!matchup.homeScore || !matchup.awayScore) {
        continue;
      }

      const homeEntry = leaderboard.get(matchup.homeTeam.id);
      const awayEntry = leaderboard.get(matchup.awayTeam.id);

      if (matchup.isTie) {
        homeEntry.ties += 1;
        awayEntry.ties += 1;
      } else if (matchup.winnerTeamId === matchup.homeTeam.id) {
        homeEntry.wins += 1;
        awayEntry.losses += 1;
      } else {
        awayEntry.wins += 1;
        homeEntry.losses += 1;
      }
    }
  }

  return [...leaderboard.values()].sort((a, b) => {
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    if (b.pointsFor !== a.pointsFor) {
      return b.pointsFor - a.pointsFor;
    }

    return a.teamName.localeCompare(b.teamName);
  });
}
