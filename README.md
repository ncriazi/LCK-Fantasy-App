# LCK Fantasy Backend

<<<<<<< HEAD
Backend setup for an LCK fantasy app using PostgreSQL and Prisma.

## Current Status

This project currently has:

- Prisma configured with PostgreSQL
- Database models for `User`, `League`, `LckPlayer`, and `FantasyTeam`
- A working seed script in [`prisma/seed.js`](./prisma/seed.js)
- Initial seeded player data for testing
=======
Backend API for an LCK fantasy app using Express, Prisma, and PostgreSQL.

## Current Status

This project currently supports:

- user signup and login with JWT auth
- protected `GET /auth/me`
- league creation for authenticated users
- invite-code league lookup and join flow
- automatic fantasy team creation on league create/join
- viewing a logged-in user's leagues
- viewing a team's roster slot layout
- seeded LCK organizations and players for local testing
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

## Tech Stack

- Node.js
<<<<<<< HEAD
- Prisma
- PostgreSQL
- Express
=======
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
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

## Project Structure

```text
lck-fantasy-backend/
<<<<<<< HEAD
├── prisma/
│   ├── schema.prisma
│   ├── seed.js
│   └── migrations/
├── src/
├── package.json
└── prisma.config.ts
=======
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
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)
```

## Environment Variables

<<<<<<< HEAD
Create a `.env` file with the following values:
=======
Create a `.env` file with:
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/YOUR_DATABASE?schema=public"
JWT_SECRET="your_secret_here"
PORT=3001
```

<<<<<<< HEAD
## Install Dependencies
=======
## Install
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

```powershell
npm install
```

<<<<<<< HEAD
## Prisma Commands

Generate the Prisma client:
=======
## Database Commands

Generate Prisma client:
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

```powershell
npx.cmd prisma generate
```

<<<<<<< HEAD
Run the database migration:
=======
Apply migrations:
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

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

<<<<<<< HEAD
## Available Scripts

```powershell
=======
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
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

<<<<<<< HEAD
## Testing So Far

The database setup has been manually verified by:

- running migrations successfully
- running the seed script successfully
- querying PostgreSQL directly and confirming seeded rows exist

Example query:

```sql
SELECT * FROM "LckPlayer";
```

Expected seeded rows:

- Faker
- Chovy
=======
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

## Example Flow

1. Sign up or log in.
2. Save the returned JWT.
3. Create a league with `POST /leagues` or join one with `POST /leagues/join`.
4. Call `GET /leagues/mine` to get the user's leagues and team ids.
5. Call `GET /teams/:teamId/roster` to view the slot-based roster shape.

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
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)

## Notes

- PostgreSQL normally runs on port `5432`
<<<<<<< HEAD
- Prisma Studio runs on its own local browser port, which is separate from the database port
- If `npm` is blocked in PowerShell, use `npm.cmd`

## Next Step

A good next step is building the first API route that fetches players from Prisma, such as:

- `GET /players`

=======
- Prisma Studio uses its own local browser port
- if `npm` is blocked in PowerShell, use `npm.cmd`
- defense scoring and waiver-wire behavior are planned for later

## Next Areas

Good next backend steps:

- manual slot assignment or draft-style player selection
- team/roster update rules
- league detail view once roster data becomes meaningful
- scoring logic
>>>>>>> 93c70fc (Add auth, leagues, and roster foundation)
