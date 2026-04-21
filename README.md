# LCK Fantasy App

Full-stack LCK fantasy app with an Express/Prisma/PostgreSQL backend and a React/Vite frontend.

## Current Status

This project currently supports:

- user signup and login with JWT auth
- protected `GET /auth/me`
- league creation for authenticated users
- invite-code league lookup and join flow
- automatic fantasy team creation on league create/join
- viewing a logged-in user's leagues
- viewing team rosters within the same league
- assigning roster slots with league-wide uniqueness rules
- clearing roster slots
- snake and manual league modes
- randomized snake draft start
- draft board with available and taken assets
- draft pick history
- manual commissioner-controlled week advancement
- waiver priority queues with league-wide claim resolution
- weekly player/defense lock state for waiver and trade rules
- commissioner-approved trades with delayed execution when assets are locked
- manual weekly stat entry with automatic fantasy point calculation
- weekly matchup views and stored finalized team scores
- leaderboard standings based on matchup wins and total points
- seeded LCK organizations and players for local testing
- React frontend with auth, league selection, roster, matchup, leaderboard, and draft room views
- commissioner-only draft start plus auto-draft for faster end-to-end testing

## Tech Stack

- Node.js
- Express
- Prisma
- PostgreSQL
- JWT
- React
- Vite

## Fantasy Format

Current roster format:

- `Top`
- `Jungle`
- `Mid`
- `Bot`
- `Support`
- `Defense`

Notes:

- `Defense` is an LCK organization like `T1` or `Gen.G`
- roster slots start empty when a fantasy team is created
- league defaults are currently fixed to:
  - `leagueSize = 8`
  - `draftType = "snake"`
  - `draftFormat = "normal"`

## Project Structure

```text
lck-fantasy-backend/
|-- prisma/
|   |-- migrations/
|   |-- schema.prisma
|   `-- seed.js
|-- client/
|   |-- src/
|   |-- package.json
|   `-- vite.config.js
|-- scripts/
|   `-- import-lck-pandascore.js
|-- src/
|   |-- lib/
|   |   |-- draft-utils.js
|   |   |-- league-utils.js
|   |   |-- scoring-utils.js
|   |   `-- transaction-utils.js
|   |-- middleware/
|   `-- routes/
|       |-- league-base.js
|       |-- league-draft.js
|       |-- league-transactions.js
|       `-- leagues.js
|-- package.json
|-- prisma.config.ts
`-- README.md
```

## Environment Variables

Create a `.env` file with:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/YOUR_DATABASE?schema=public"
JWT_SECRET="your_secret_here"
PORT=3001
PANDASCORE_API_TOKEN="optional_for_imports_only"
```

## Install

```powershell
npm install
cd client
npm install
```

## Database Commands

Generate Prisma client:

```powershell
npx.cmd prisma generate
```

Apply migrations:

```powershell
npx.cmd prisma migrate dev
```

Seed the database:

```powershell
npm.cmd run db:seed
```

Open Prisma Studio:

```powershell
npx.cmd prisma studio
```

## Run the Server

```powershell
npm.cmd run dev
```

Server base URL:

```text
http://localhost:3001
```

## Run The Frontend

```powershell
cd client
npm.cmd run dev
```

Frontend dev URL:

```text
http://localhost:5173
```

The Vite dev server proxies `/api` requests to the backend on `localhost:3001`.

## Available Scripts

```powershell
npm.cmd run dev
npm.cmd run start
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run data:import:lck
```

Frontend scripts:

```powershell
cd client
npm.cmd run dev
npm.cmd run build
```

## Current Models

- `User`
- `League`
- `FantasyTeam`
- `LckOrganization`
- `LckPlayer`
- `WaiverPriority`
- `WaiverClaim`
- `WeeklyPlayerState`
- `WeeklyDefenseState`
- `WeeklyTeamScore`
- `TradeProposal`

## Current Routes

Auth:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`

Health:

- `GET /health`

Players:

- `GET /players`

Leagues:

- `GET /leagues/mine`
- `GET /leagues/by-code/:inviteCode`
- `POST /leagues`
- `POST /leagues/join`
- `POST /leagues/:leagueId/draft/start`
- `GET /leagues/:leagueId/draft`
- `GET /leagues/:leagueId/draft/board`
- `POST /leagues/:leagueId/draft/pick`
- `GET /leagues/:leagueId/waivers`
- `POST /leagues/:leagueId/waivers/claim`
- `GET /leagues/:leagueId/trades`
- `POST /leagues/:leagueId/trades`
- `POST /leagues/:leagueId/trades/:tradeId/respond`
- `POST /leagues/:leagueId/trades/:tradeId/review`
- `POST /leagues/:leagueId/week/player-state`
- `POST /leagues/:leagueId/week/defense-state`
- `POST /leagues/:leagueId/week/advance`
- `GET /leagues/:leagueId/matchups`
- `GET /leagues/:leagueId/leaderboard`

Teams:

- `GET /teams/:teamId/roster`
- `PATCH /teams/:teamId/roster`

## Example Flow

1. Sign up or log in.
2. Save the returned JWT.
3. Create a league with `POST /leagues` or join one with `POST /leagues/join`.
4. Call `GET /leagues/mine` to get the user's leagues and team ids.
5. Call `GET /teams/:teamId/roster` to view the slot-based roster shape.
6. Call `PATCH /teams/:teamId/roster` to assign or clear slots.
7. For snake leagues, start the draft and use the draft board/pick routes.

## Roster Updates

Supported player slots:

- `top`
- `jungle`
- `mid`
- `bot`
- `support`

Defense slot:

- `defense`

Assignment examples:

Assign a player:

```json
{
  "slot": "mid",
  "playerId": "player_cuid_here"
}
```

Assign a defense organization:

```json
{
  "slot": "defense",
  "organizationId": "org_cuid_here"
}
```

Clear a slot:

```json
{
  "slot": "mid",
  "clear": true
}
```

Rules currently enforced:

- users can only edit their own team
- users in the same league can still view other team rosters
- player role must match the slot
- a player can only appear on one fantasy team per league
- a defense organization can only appear on one fantasy team per league

## Draft Flow

League modes:

- `snake`
- `manual`

Snake draft supports:

- randomized draft order
- snake turn order across rounds
- auto-slotting by player role or defense organization
- draft board visibility for league members
- pick history
- commissioner-only auto-draft path for faster league testing

Draft examples:

Start a draft:

```text
POST /leagues/:leagueId/draft/start
```

Fetch draft state:

```text
GET /leagues/:leagueId/draft
```

Fetch draft board:

```text
GET /leagues/:leagueId/draft/board
GET /leagues/:leagueId/draft/board?role=mid
```

Make a player pick:

```json
{
  "playerId": "player_cuid_here"
}
```

Make a defense pick:

```json
{
  "organizationId": "org_cuid_here"
}
```

Auto-draft current pick:

```text
POST /leagues/:leagueId/draft/autopick
```

## Waivers And Trades

Week management:

- leagues track a `currentWeek`
- only the commissioner can update weekly lock state or advance the week
- advancing the week is what resolves pending waiver claims and approved locked trades

Waivers:

- multiple teams can queue claims for the same player or defense
- waiver priority decides which pending claim resolves first
- a successful claim moves that team to the back of the waiver order
- claims stay pending until the commissioner advances the week
- claims fail if the asset is no longer available when they are processed

Trade flow:

- trades are currently one-for-one and must use the same slot type on both sides
- recipient team must accept first
- commissioner must approve after that
- if either traded asset is already locked for the current week, the trade is approved but waits until the next week to complete

Example waiver claim:

```json
{
  "slot": "mid",
  "playerId": "player_cuid_here"
}
```

Example trade proposal:

```json
{
  "recipientTeamId": "team_cuid_here",
  "proposerSlot": "top",
  "recipientSlot": "top"
}
```

Example commissioner week state update:

```json
{
  "playerId": "player_cuid_here",
  "kills": 5,
  "assists": 7,
  "cs": 320,
  "visionScore": 45
}
```

## Scoring, Matchups, And Leaderboard

Iteration 1 scoring source:

- manual or sheet-assisted weekly stat entry by the commissioner
- backend calculates fantasy points from those raw totals

Current scoring rules:

- player kills: `+1`
- player assists: `+0.5`
- player CS and vision score: `+0.02` each
- defense towers alive: `+0.5`

Weekly stat entry examples:

Player weekly totals:

```json
{
  "playerId": "player_cuid_here",
  "kills": 5,
  "assists": 7,
  "cs": 320,
  "visionScore": 45
}
```

Defense weekly totals:

```json
{
  "organizationId": "org_cuid_here",
  "towersAlive": 6
}
```

How week scoring works:

- `GET /leagues/:leagueId/matchups`
  Returns matchup pairings for the requested week, with live scores if the week is still open
- `POST /leagues/:leagueId/week/advance`
  Finalizes the current week into stored `WeeklyTeamScore` rows, then opens the next week
- `GET /leagues/:leagueId/matchups?week=1`
  Returns finalized matchup results for a previous week
- `GET /leagues/:leagueId/leaderboard`
  Returns standings ordered by wins, then total points scored

## Current Seed Data

Organizations:

- `T1`
- `Gen.G`

Seeded roles per organization:

- `top`
- `jungle`
- `mid`
- `bot`
- `support`

## External LCK Import

For a real player pool, the repo now includes a PandaScore-backed bootstrap script:

```powershell
npm.cmd run data:import:lck
```

It expects this env var:

```env
PANDASCORE_API_TOKEN="your_token_here"
```

What it does:

- looks up the current official LCK organizations
- fetches team rosters from PandaScore
- upserts one starter per role into `LckPlayer`
- creates any missing `LckOrganization` rows

Current caveat:

- this is best used before active league testing, because importing can rename starter rows for existing organization/role pairs

## Notes

- PostgreSQL normally runs on port `5432`
- Prisma Studio uses its own local browser port
- if `npm` is blocked in PowerShell, use `npm.cmd`
- frontend invite-code UX still needs polish
- defense scoring automation is still planned for later

## Next Areas

Good next backend steps:

- production auth/session hardening for real users
- better league invite UX in the frontend
- deeper frontend flows for roster editing, waivers, trades, and commissioner stat entry
- waiver claim cancellation or reprioritization polish
- richer trade formats if bench/flex rules are added later
