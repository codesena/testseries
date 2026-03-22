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

## What’s Implemented

- Student flow: Home → Start → Attempt → Report
- APIs: tests, attempts, responses, events, submit, report
- Marking schemes supported in scoring:
	- `MAINS_SINGLE`
	- `MAINS_NUMERICAL` / `ADV_NAT`
	- `ADV_MULTI_CORRECT` (subset partial marking)

## Notes

- This repository includes basic exam-like restrictions (context menu + basic copy/paste blocking) and logs tab/fullscreen changes; it is not a secure proctoring system.
