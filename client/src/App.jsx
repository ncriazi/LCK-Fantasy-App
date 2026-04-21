import { startTransition, useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_KEY = "lck-fantasy-session";
const ROLE_LABELS = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  bot: "ADC",
  support: "Support",
  defense: "Defense",
};

async function apiRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data;
}

const api = {
  signup(payload) {
    return apiRequest("/auth/signup", { method: "POST", body: payload });
  },
  login(payload) {
    return apiRequest("/auth/login", { method: "POST", body: payload });
  },
  me(token) {
    return apiRequest("/auth/me", { token });
  },
  leagues(token) {
    return apiRequest("/leagues/mine", { token });
  },
  createLeague(token, payload) {
    return apiRequest("/leagues", { method: "POST", token, body: payload });
  },
  joinLeague(token, payload) {
    return apiRequest("/leagues/join", { method: "POST", token, body: payload });
  },
  roster(token, teamId) {
    return apiRequest(`/teams/${teamId}/roster`, { token });
  },
  matchups(token, leagueId) {
    return apiRequest(`/leagues/${leagueId}/matchups`, { token });
  },
  leaderboard(token, leagueId) {
    return apiRequest(`/leagues/${leagueId}/leaderboard`, { token });
  },
  draftState(token, leagueId) {
    return apiRequest(`/leagues/${leagueId}/draft`, { token });
  },
  draftBoard(token, leagueId, role = "") {
    return apiRequest(
      `/leagues/${leagueId}/draft/board${role ? `?role=${encodeURIComponent(role)}` : ""}`,
      { token },
    );
  },
  startDraft(token, leagueId) {
    return apiRequest(`/leagues/${leagueId}/draft/start`, {
      method: "POST",
      token,
    });
  },
  makeDraftPick(token, leagueId, payload) {
    return apiRequest(`/leagues/${leagueId}/draft/pick`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  autoDraftPick(token, leagueId) {
    return apiRequest(`/leagues/${leagueId}/draft/autopick`, {
      method: "POST",
      token,
    });
  },
};

function formatRecord(entry) {
  return `${entry.wins}-${entry.losses}${entry.ties ? `-${entry.ties}` : ""}`;
}

function formatScore(value) {
  if (value == null) {
    return "--";
  }

  return Number(value).toFixed(1);
}

function formatDraftAsset(asset) {
  if (!asset) {
    return "Unknown pick";
  }

  if (asset.organization) {
    return `${asset.name} - ${asset.organization.name}`;
  }

  return asset.name;
}

function formatRoleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

function App() {
  const [authMode, setAuthMode] = useState("signup");
  const [credentials, setCredentials] = useState({
    email: "",
    username: "",
    password: "",
  });
  const [session, setSession] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { token: "", user: null };
  });
  const [booting, setBooting] = useState(Boolean(session.token));
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [leagues, setLeagues] = useState([]);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [leagueDetail, setLeagueDetail] = useState({
    roster: null,
    matchups: null,
    leaderboard: null,
    draftState: null,
    draftBoard: null,
  });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [leagueActionError, setLeagueActionError] = useState("");
  const [leagueActionSuccess, setLeagueActionSuccess] = useState("");
  const [leagueForm, setLeagueForm] = useState({
    createName: "",
    joinCode: "",
  });
  const [draftRoleFilter, setDraftRoleFilter] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [autoDraftEnabled, setAutoDraftEnabled] = useState(false);
  const [autoDraftCountdown, setAutoDraftCountdown] = useState(4);

  const currentLeague = useMemo(
    () => leagues.find((league) => league.id === selectedLeagueId) ?? null,
    [leagues, selectedLeagueId],
  );

  const canStartDraft =
    currentLeague?.draftType === "snake" &&
    currentLeague?.isCommissioner &&
    leagueDetail.draftState &&
    !leagueDetail.draftState.draftStartedAt;

  const isOnClock =
    Boolean(currentLeague?.team?.id) &&
    leagueDetail.draftState?.currentTeamOnClock?.id === currentLeague?.team?.id;
  const canControlAutoDraft =
    currentLeague?.draftType === "snake" &&
    currentLeague?.isCommissioner &&
    leagueDetail.draftState?.draftStartedAt &&
    !leagueDetail.draftState?.isDrafted;

  useEffect(() => {
    if (!session.token) {
      setBooting(false);
      return;
    }

    let active = true;

    async function bootstrap() {
      try {
        const me = await api.me(session.token);
        if (!active) {
          return;
        }

        setSession((current) => {
          const next = { ...current, user: me.user };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      } catch {
        if (!active) {
          return;
        }

        localStorage.removeItem(STORAGE_KEY);
        setSession({ token: "", user: null });
      } finally {
        if (active) {
          setBooting(false);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [session.token]);

  async function refreshLeagues(preferredLeagueId) {
    const nextLeagues = await api.leagues(session.token);
    setLeagues(nextLeagues);
    setSelectedLeagueId((current) => {
      if (preferredLeagueId && nextLeagues.some((league) => league.id === preferredLeagueId)) {
        return preferredLeagueId;
      }

      if (current && nextLeagues.some((league) => league.id === current)) {
        return current;
      }

      return nextLeagues[0]?.id ?? "";
    });
  }

  useEffect(() => {
    if (!session.token) {
      setLeagues([]);
      setSelectedLeagueId("");
      setLeagueDetail({
        roster: null,
        matchups: null,
        leaderboard: null,
        draftState: null,
        draftBoard: null,
      });
      return;
    }

    let active = true;
    setLeaguesLoading(true);

    api
      .leagues(session.token)
      .then((nextLeagues) => {
        if (!active) {
          return;
        }

        setLeagues(nextLeagues);
        setSelectedLeagueId((current) => {
          if (current && nextLeagues.some((league) => league.id === current)) {
            return current;
          }

          return nextLeagues[0]?.id ?? "";
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setLeagueActionError(error.message);
      })
      .finally(() => {
        if (active) {
          setLeaguesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session.token]);

  useEffect(() => {
    if (!session.token || !selectedLeagueId || !currentLeague?.team?.id) {
      setLeagueDetail({
        roster: null,
        matchups: null,
        leaderboard: null,
        draftState: null,
        draftBoard: null,
      });
      return;
    }

    let active = true;

    async function loadLeagueDetail() {
      setDetailLoading(true);
      setDetailError("");

      try {
        const requests = [
          api.roster(session.token, currentLeague.team.id),
          api.matchups(session.token, selectedLeagueId),
          api.leaderboard(session.token, selectedLeagueId),
        ];

        if (currentLeague.draftType === "snake") {
          requests.push(api.draftState(session.token, selectedLeagueId));
          requests.push(api.draftBoard(session.token, selectedLeagueId, draftRoleFilter));
        }

        const result = await Promise.all(requests);
        if (!active) {
          return;
        }

        const [roster, matchups, leaderboard, draftState = null, draftBoard = null] = result;

        setLeagueDetail({
          roster,
          matchups,
          leaderboard,
          draftState,
          draftBoard,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setDetailError(error.message);
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    }

    loadLeagueDetail();

    return () => {
      active = false;
    };
  }, [currentLeague, draftRoleFilter, selectedLeagueId, session.token]);

  useEffect(() => {
    if (
      !session.token ||
      !selectedLeagueId ||
      currentLeague?.draftType !== "snake" ||
      !leagueDetail.draftState?.draftStartedAt ||
      leagueDetail.draftState?.isDrafted
    ) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const [draftState, draftBoard] = await Promise.all([
          api.draftState(session.token, selectedLeagueId),
          api.draftBoard(session.token, selectedLeagueId, draftRoleFilter),
        ]);

        setLeagueDetail((current) => ({
          ...current,
          draftState,
          draftBoard,
        }));
      } catch {
        // keep polling quiet for now
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [
    currentLeague?.draftType,
    draftRoleFilter,
    leagueDetail.draftState?.draftStartedAt,
    leagueDetail.draftState?.isDrafted,
    selectedLeagueId,
    session.token,
  ]);

  useEffect(() => {
    if (!canControlAutoDraft || !autoDraftEnabled) {
      setAutoDraftCountdown(4);
      return;
    }

    const intervalId = setInterval(() => {
      setAutoDraftCountdown((current) => {
        if (current <= 1) {
          handleAutoDraftTick();
          return 4;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [autoDraftEnabled, canControlAutoDraft, leagueDetail.draftState?.currentPickNumber]);

  function updateCredential(field, value) {
    setCredentials((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const response =
        authMode === "signup"
          ? await api.signup(credentials)
          : await api.login({
              username: credentials.username,
              password: credentials.password,
            });

      const nextSession = {
        token: response.token,
        user: response.user,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setCredentials({
        email: "",
        username: "",
        password: "",
      });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession({ token: "", user: null });
    setLeagueActionError("");
    setLeagueActionSuccess("");
  }

  async function handleCreateLeague(event) {
    event.preventDefault();
    setLeagueActionError("");
    setLeagueActionSuccess("");

    try {
      const created = await api.createLeague(session.token, {
        name: leagueForm.createName,
      });
      setLeagueForm((current) => ({ ...current, createName: "" }));
      setLeagueActionSuccess(`Created ${created.name} with code ${created.inviteCode}`);
      await refreshLeagues(created.id);
    } catch (error) {
      setLeagueActionError(error.message);
    }
  }

  async function handleJoinLeague(event) {
    event.preventDefault();
    setLeagueActionError("");
    setLeagueActionSuccess("");

    try {
      const joined = await api.joinLeague(session.token, {
        inviteCode: leagueForm.joinCode,
      });
      setLeagueForm((current) => ({ ...current, joinCode: "" }));
      setLeagueActionSuccess(`Joined ${joined.league.name}`);
      await refreshLeagues(joined.league.id);
    } catch (error) {
      setLeagueActionError(error.message);
    }
  }

  async function handleStartDraft() {
    if (!currentLeague) {
      return;
    }

    setDraftLoading(true);
    setDetailError("");

    try {
      const [draftState, draftBoard] = await Promise.all([
        api.startDraft(session.token, currentLeague.id),
        api.draftBoard(session.token, currentLeague.id, draftRoleFilter),
      ]);

      setLeagueDetail((current) => ({
        ...current,
        draftState,
        draftBoard,
      }));
      setLeagueActionSuccess(`Draft started for ${currentLeague.name}`);
      await refreshLeagues(currentLeague.id);
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleDraftPick(payload) {
    if (!currentLeague) {
      return;
    }

    setDraftLoading(true);
    setDetailError("");

    try {
      const result = await api.makeDraftPick(session.token, currentLeague.id, payload);
      const draftBoard = await api.draftBoard(session.token, currentLeague.id, draftRoleFilter);

      setLeagueDetail((current) => ({
        ...current,
        draftState: result.draft,
        draftBoard,
        roster:
          result.teams.find((team) => team.id === currentLeague.team.id)
            ? {
                ...current.roster,
                roster: result.teams.find((team) => team.id === currentLeague.team.id).roster,
              }
            : current.roster,
      }));

      await refreshLeagues(currentLeague.id);
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleAutoDraftTick() {
    if (!currentLeague || draftLoading) {
      return;
    }

    setDraftLoading(true);
    setDetailError("");

    try {
      const result = await api.autoDraftPick(session.token, currentLeague.id);
      const draftBoard = await api.draftBoard(session.token, currentLeague.id, draftRoleFilter);

      setLeagueDetail((current) => ({
        ...current,
        draftState: result.draft,
        draftBoard,
        roster:
          result.teams.find((team) => team.id === currentLeague.team.id)
            ? {
                ...current.roster,
                roster: result.teams.find((team) => team.id === currentLeague.team.id).roster,
              }
            : current.roster,
      }));

      if (result.draft?.isDrafted) {
        setAutoDraftEnabled(false);
      }

      await refreshLeagues(currentLeague.id);
    } catch (error) {
      setAutoDraftEnabled(false);
      setDetailError(error.message);
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleCopyInviteCode() {
    if (!currentLeague?.inviteCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentLeague.inviteCode);
      setLeagueActionSuccess(`Copied invite code ${currentLeague.inviteCode}`);
    } catch {
      setLeagueActionError("Could not copy invite code on this browser");
    }
  }

  if (booting) {
    return <div className="shell loading-shell">Reconnecting to your league desk...</div>;
  }

  if (!session.token || !session.user) {
    return (
      <main className="shell auth-shell">
        <section className="hero-panel">
          <p className="eyebrow">LCK Fantasy</p>
          <h1>Build your league like it already exists on match day.</h1>
          <p className="hero-copy">
            Sign in, create a league, and get straight into roster, matchup, and
            standings views backed by the API we just built.
          </p>
          <div className="hero-notes">
            <span>Snake or manual leagues</span>
            <span>Roster + waiver + trade ready</span>
            <span>Scoring and leaderboard live</span>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-toggle">
            <button
              className={authMode === "signup" ? "active" : ""}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Sign up
            </button>
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Log in
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" ? (
              <label>
                Email
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(event) => updateCredential("email", event.target.value)}
                  placeholder="coach@example.com"
                  required
                />
              </label>
            ) : null}

            <label>
              Username
              <input
                value={credentials.username}
                onChange={(event) => updateCredential("username", event.target.value)}
                placeholder="yourleagueid"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={credentials.password}
                onChange={(event) => updateCredential("password", event.target.value)}
                placeholder="password123"
                required
              />
            </label>

            {authError ? <p className="feedback error">{authError}</p> : null}

            <button className="primary-button" disabled={authLoading} type="submit">
              {authLoading ? "Working..." : authMode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="eyebrow">LCK Fantasy</p>
          <h2>{session.user.username}</h2>
          <button className="ghost-button" onClick={handleLogout} type="button">
            Log out
          </button>
        </div>

        <div className="sidebar-block">
          <h3>League actions</h3>
          <form className="stack-form" onSubmit={handleCreateLeague}>
            <label>
              Create league
              <input
                value={leagueForm.createName}
                onChange={(event) =>
                  setLeagueForm((current) => ({
                    ...current,
                    createName: event.target.value,
                  }))
                }
                placeholder="Spring Split Group"
                required
              />
            </label>
            <button className="primary-button" type="submit">
              Create
            </button>
          </form>

          <form className="stack-form" onSubmit={handleJoinLeague}>
            <label>
              Join by code
              <input
                value={leagueForm.joinCode}
                onChange={(event) =>
                  setLeagueForm((current) => ({
                    ...current,
                    joinCode: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="ABC123"
                required
              />
            </label>
            <button className="secondary-button" type="submit">
              Join
            </button>
          </form>

          {leagueActionError ? <p className="feedback error">{leagueActionError}</p> : null}
          {leagueActionSuccess ? <p className="feedback success">{leagueActionSuccess}</p> : null}
        </div>

        <div className="sidebar-block">
          <div className="section-heading">
            <h3>My leagues</h3>
            {leaguesLoading ? <span className="mini-status">syncing</span> : null}
          </div>

          <div className="league-list">
            {leagues.map((league) => (
              <button
                key={league.id}
                className={league.id === selectedLeagueId ? "league-chip active" : "league-chip"}
                onClick={() => {
                  startTransition(() => {
                    setSelectedLeagueId(league.id);
                  });
                }}
                type="button"
              >
                <strong>{league.name}</strong>
                <span>{league.team.name}</span>
                <code>{league.inviteCode}</code>
              </button>
            ))}
            {!leagues.length && !leaguesLoading ? (
              <p className="empty-state">Create or join a league to begin.</p>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="workspace">
        {currentLeague ? (
          <>
            <header className="workspace-header">
              <div>
                <p className="eyebrow">League selected</p>
                <h1>{currentLeague.name}</h1>
              </div>
              <div className="league-meta">
                <span className="invite-code-pill">
                  Code {currentLeague.inviteCode}
                  <button className="inline-code-button" onClick={handleCopyInviteCode} type="button">
                    Copy
                  </button>
                </span>
                <span>{currentLeague.draftType} draft</span>
                <span>{currentLeague.team.name}</span>
              </div>
            </header>

            {detailError ? <p className="feedback error">{detailError}</p> : null}

            {currentLeague.draftType === "snake" ? (
              <article className="panel draft-panel">
                <div className="section-heading">
                  <div>
                    <h3>Draft room</h3>
                  </div>
                  <div className="draft-actions">
                    {leagueDetail.draftState?.draftStartedAt ? (
                      <span className="mini-status">
                        round {leagueDetail.draftState.currentRound} - pick{" "}
                        {leagueDetail.draftState.currentPickNumber}
                      </span>
                    ) : null}
                    {canStartDraft ? (
                      <button
                        className="primary-button"
                        disabled={draftLoading}
                        onClick={handleStartDraft}
                        type="button"
                      >
                        {draftLoading ? "Starting..." : "Start draft"}
                      </button>
                    ) : null}
                    {canControlAutoDraft ? (
                      <button
                        className={autoDraftEnabled ? "primary-button" : "secondary-button"}
                        disabled={draftLoading}
                        onClick={() => setAutoDraftEnabled((current) => !current)}
                        type="button"
                      >
                        {autoDraftEnabled ? `Auto draft ${autoDraftCountdown}s` : "Auto draft"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {leagueDetail.draftState?.draftStartedAt ? (
                  <>
                    <div className="draft-hero">
                      <div>
                        <span className="slot-tag">On the clock</span>
                        <strong>
                          {leagueDetail.draftState.currentTeamOnClock?.name ?? "Draft complete"}
                        </strong>
                      </div>
                      <div>
                        <span className="slot-tag">Your status</span>
                        <strong>{isOnClock ? "Make your pick" : "Waiting"}</strong>
                      </div>
                      <div>
                        <span className="slot-tag">Filter</span>
                        <div className="draft-filter-row">
                          {["", "top", "jungle", "mid", "bot", "support"].map((role) => (
                            <button
                              key={role || "all"}
                              className={
                                role === draftRoleFilter ? "role-filter active" : "role-filter"
                              }
                              onClick={() => setDraftRoleFilter(role)}
                              type="button"
                            >
                              {role ? formatRoleLabel(role) : "All"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="draft-grid">
                      <section className="draft-column">
                        <div className="section-heading">
                          <h3>Available players</h3>
                          <span className="mini-status">
                            {leagueDetail.draftBoard?.availablePlayers?.length ?? 0} left
                          </span>
                        </div>
                        <div className="draft-asset-list">
                          {leagueDetail.draftBoard?.availablePlayers?.map((player) => (
                            <div className="draft-asset-card" key={player.id}>
                              <div>
                                <strong>{player.name}</strong>
                                <span>
                                  {formatRoleLabel(player.role)} - {player.organization.name}
                                </span>
                              </div>
                              <button
                                className="secondary-button"
                                disabled={!isOnClock || draftLoading}
                                onClick={() => handleDraftPick({ playerId: player.id })}
                                type="button"
                              >
                                Draft
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="section-heading section-spacer">
                          <h3>Defenses</h3>
                          <span className="mini-status">
                            {leagueDetail.draftBoard?.availableDefenses?.length ?? 0} left
                          </span>
                        </div>
                        <div className="draft-asset-list">
                          {leagueDetail.draftBoard?.availableDefenses?.map((organization) => (
                            <div className="draft-asset-card" key={organization.id}>
                              <div>
                                <strong>{organization.name}</strong>
                                <span>defense</span>
                              </div>
                              <button
                                className="secondary-button"
                                disabled={!isOnClock || draftLoading}
                                onClick={() =>
                                  handleDraftPick({ organizationId: organization.id })
                                }
                                type="button"
                              >
                                Draft
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="draft-column">
                        <div className="section-heading">
                          <h3>Draft order</h3>
                          <span className="mini-status">
                            {leagueDetail.draftState?.draftOrder?.length ?? 0} teams
                          </span>
                        </div>
                        <div className="draft-order-list">
                          {leagueDetail.draftState?.draftOrder?.map((entry) => (
                            <div className="draft-order-row" key={entry.pickPosition}>
                              <span>#{entry.pickPosition}</span>
                              <strong>{entry.team.name}</strong>
                            </div>
                          ))}
                        </div>

                        <div className="section-heading section-spacer">
                          <h3>Recent picks</h3>
                          <span className="mini-status">
                            {leagueDetail.draftState?.pickHistory?.length ?? 0} total
                          </span>
                        </div>
                        <div className="draft-history-list">
                          {leagueDetail.draftState?.pickHistory?.length ? (
                            [...leagueDetail.draftState.pickHistory]
                              .reverse()
                              .slice(0, 10)
                              .map((pick) => (
                                <div className="draft-history-row" key={pick.id}>
                                  <div>
                                    <strong>{pick.team.name}</strong>
                                    <span>
                                      Round {pick.round} - Pick {pick.overallPick}
                                    </span>
                                  </div>
                                  <div>
                                    <strong>{formatDraftAsset(pick.player ?? pick.organization)}</strong>
                                    <span>{formatRoleLabel(pick.slot)}</span>
                                  </div>
                                </div>
                              ))
                          ) : (
                            <p className="empty-state">No picks yet.</p>
                          )}
                        </div>
                      </section>
                    </div>
                  </>
                ) : (
                  <p className="empty-state">
                    This snake league is ready for a commissioner to start the draft once all
                    8 teams are in.
                  </p>
                )}
              </article>
            ) : null}

            <section className="panel-grid">
              <article className="panel">
                <div className="section-heading">
                  <h3>Roster</h3>
                  {detailLoading ? <span className="mini-status">loading</span> : null}
                </div>
                {leagueDetail.roster ? (
                  <div className="roster-grid">
                    {Object.entries(leagueDetail.roster.roster).map(([slot, asset]) => (
                      <div className="roster-card" key={slot}>
                        <span className="slot-tag">{formatRoleLabel(slot)}</span>
                        {asset ? (
                          <>
                            <strong>{asset.name}</strong>
                            <span>
                              {"organization" in asset ? asset.organization.name : "Defense"}
                            </span>
                          </>
                        ) : (
                          <span className="muted">Empty slot</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">Select a league to view your roster.</p>
                )}
              </article>

              <article className="panel">
                <div className="section-heading">
                  <h3>Current matchups</h3>
                  {leagueDetail.matchups?.finalized ? (
                    <span className="mini-status settled">finalized</span>
                  ) : (
                    <span className="mini-status">live</span>
                  )}
                </div>
                {leagueDetail.matchups?.matchups?.length ? (
                  <div className="matchup-list">
                    {leagueDetail.matchups.matchups.map((matchup) => (
                      <div className="matchup-card" key={matchup.matchupNumber}>
                        <div>
                          <strong>{matchup.homeTeam.name}</strong>
                          <span>{formatScore(matchup.homeScore?.totalPoints)}</span>
                        </div>
                        <div className="versus">vs</div>
                        <div>
                          <strong>{matchup.awayTeam.name}</strong>
                          <span>{formatScore(matchup.awayScore?.totalPoints)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">
                    Matchups will appear after teams are scored for the week.
                  </p>
                )}
              </article>
            </section>

            <article className="panel leaderboard-panel">
              <div className="section-heading">
                <h3>Leaderboard</h3>
                <span className="mini-status">
                  week {leagueDetail.matchups?.week ?? 1}
                </span>
              </div>

              {leagueDetail.leaderboard?.leaderboard?.length ? (
                <div className="leaderboard-table">
                  <div className="leaderboard-head">
                    <span>Team</span>
                    <span>Record</span>
                    <span>Points For</span>
                  </div>
                  {leagueDetail.leaderboard.leaderboard.map((entry, index) => (
                    <div className="leaderboard-row" key={entry.teamId}>
                      <span>
                        #{index + 1} {entry.teamName}
                      </span>
                      <span>{formatRecord(entry)}</span>
                      <span>{formatScore(entry.pointsFor)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">Leaderboard data will populate after week one closes.</p>
              )}
            </article>
          </>
        ) : (
          <section className="empty-workspace">
            <p className="eyebrow">No league selected</p>
            <h1>Start with one league and we can build the rest from there.</h1>
            <p>
              Create a league from the left or join one by invite code to begin testing
              the frontend against the backend.
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
