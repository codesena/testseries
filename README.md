# JEE Test Series (CBT Mock)

Next.js + PostgreSQL (Prisma) mock-test platform that implements a JEE-style CBT engine:

- 3-hour style master timer (auto-submit on zero)
- Bento-grid **question palette** with JEE state colors
- LaTeX rendering via MathJax v3
- Event-based time tracking + basic post-test analytics
- Offline-first queue (IndexedDB outbox) + heartbeat sync

See the architecture blueprint in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js **22.x or 24.x** recommended (Prisma may not work on non‑LTS Node builds)
- PostgreSQL 16+ (or Docker)

## Local Setup (Recommended: Docker)

1) Start Postgres + Redis

`npm run db:up`

2) Run migrations and seed sample data

`npm run db:migrate`

`npm run db:seed`

3) Start the app

`npm run dev`

Open `http://localhost:3000`.

## Environment

Copy `.env.example` → `.env` and adjust if needed.

- `DATABASE_URL`
- `REDIS_URL` (optional; Redis isn’t required for the current feature set)
- `NEXT_PUBLIC_IDLE_TIMEOUT_MS` (default 300000)
- `NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS` (default 30000)

### Import from Notion (Seed Your Own Tests)

This repo supports seeding tests/questions from a Notion **database** (not a plain page).

1) Create a Notion internal integration, copy the token, and share your Questions database with that integration.

2) Add these to `.env`:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID` (a Notion database id, or a page id that contains an embedded database)
- `NOTION_DATABASE_TITLE` (optional; only needed if the page contains multiple databases)
- `NOTION_IMPORT_MODE` = `error` (default) or `replace` (overwrites tests with the same title)

3) Your Notion database must include these properties (spelling/case must match):

- `Test Title` (rich text)
- `Duration Minutes` (number)
- `Advanced` (checkbox)
- `Order` (number)
- `Subject` (select: Physics/Chemistry/Mathematics)
- `Topic` (rich text)
- `Type` (select: MCQ or Numerical)
- `Question` (rich text; write LaTeX as `$...$` like in the sample seed)
- `Option A` / `Option B` / `Option C` / `Option D` (rich text; MCQ only)
- `Option A Image URL` / `Option B Image URL` / `Option C Image URL` / `Option D Image URL` (rich text; MCQ only; optional; enables image-only options)
- `Correct Option` (select: A/B/C/D; MCQ only)
- `Correct Integer` (number; Numerical only; must be an integer)
- `Image URLs` (rich text; optional; comma or newline separated Cloudinary URLs)
- `Difficulty` (number; optional)

4) Run the import:

`npm run db:seed:notion`

Notes:

- If you imported the table via CSV, Notion may create many columns as plain text (`rich_text`). The importer supports that too (it will parse numbers/booleans from text), but using proper Notion property types (Select/Number/Checkbox) is more reliable.
- For your target pattern per subject (JEE Main-like): create **25 rows per subject per test** → `20` rows with `Type=MCQ` and `5` rows with `Type=Numerical` (and fill `Correct Integer`).

## What’s Implemented

- Student flow: Home → Start → Attempt → Report
- APIs: tests, attempts, responses, events, submit, report
- Marking schemes supported in scoring:
	- `MAINS_SINGLE`
	- `MAINS_NUMERICAL` / `ADV_NAT`
	- `ADV_MULTI_CORRECT` (subset partial marking)

## Notes

- This repository includes basic exam-like restrictions (context menu + basic copy/paste blocking) and logs tab/fullscreen changes; it is not a secure proctoring system.
