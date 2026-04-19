# LCK Fantasy Backend

Backend API for an LCK fantasy app using Express, Prisma, and PostgreSQL.

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
- seeded LCK organizations and players for local testing

## Tech Stack

- Node.js
- Express
- Prisma
- PostgreSQL
- JWT

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
|-- src/
|   |-- lib/
|   |-- middleware/
|   `-- routes/
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
```

## Install

```powershell
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

## Available Scripts

```powershell
npm.cmd run dev
npm.cmd run start
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

## Current Models

- `User`
- `League`
- `FantasyTeam`
- `LckOrganization`
- `LckPlayer`

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

## Notes

- PostgreSQL normally runs on port `5432`
- Prisma Studio uses its own local browser port
- if `npm` is blocked in PowerShell, use `npm.cmd`
- defense scoring and waiver-wire behavior are planned for later

## Next Areas

Good next backend steps:

- league detail view once roster data becomes meaningful
- draft-style turn and pick flow
- scoring logic
