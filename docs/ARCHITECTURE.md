# JEE CBT Mock Platform — Architecture Blueprint

This document describes the platform implemented in this repository and how it maps to a “better than official” JEE CBT experience: low cognitive load UI, LaTeX rendering, offline resilience, and event-based analytics.

## Product Goals

- **Exam reliability first**: autosave/heartbeat + offline queue; navigation never blocks on network.
- **Reduce interface noise**: consistent hierarchy, large click targets, predictable navigation.
- **High-fidelity content**: LaTeX-first question text/options; diagram assets via external URLs.
- **Granular analytics**: event-based time-on-task + path analysis; section/topic rollups.

## UX Model (Student)

### Palette states

Palette states follow the JEE semantics:

- `NOT_VISITED`: question never opened.
- `VISITED_NOT_ANSWERED`: opened but not saved.
- `ANSWERED_SAVED`: answer committed via **Save & Next**.
- `MARKED_FOR_REVIEW`: marked for second pass with no saved answer.
- `ANSWERED_MARKED_FOR_REVIEW`: saved answer + marked.

### Navigation

- Subject tabs (Physics/Chemistry/Mathematics) highlight the active section.
- Bento-grid palette provides large touch targets.
- Keyboard shortcuts:
  - `Alt+N` next
  - `Alt+V` mark for review & next
  - `1–4` select/toggle options

### Dark mode

- Theme uses CSS variables (set by `html[data-theme]`) for predictable contrast.

## Content Model

### LaTeX rendering

- Question text and option text are stored as plain text (LaTeX inline `$...$` or display `$$...$$`).
- Frontend uses MathJax v3 via `better-react-mathjax` (supports `mhchem`).

### Diagrams

- Store diagram URLs/metadata in question `options`/payload as needed.
- Production recommendation: put diagrams in S3-compatible object storage and serve via CDN (CloudFront).

## Analytics (Event-Based)

### Event stream

The frontend emits events to `ActivityLogs` and increments per-question time via deltas:

- `QUESTION_LOAD`, `NAVIGATE`, `PALETTE_CLICK`
- `IDLE_START` / `IDLE_END` (idle threshold default: 5 minutes)
- `TAB_HIDDEN` / `TAB_VISIBLE`
- `FULLSCREEN_ENTER` / `FULLSCREEN_EXIT`
- `HEARTBEAT` (default 30s)
- `SUBMIT`

### Time-on-task

- The UI maintains a per-question second counter.
- Every navigation/save/heartbeat computes `timeDeltaSeconds` since last sync and sends it to the backend.

### Derived metrics

The report API computes:

- Average time per subject (via response times + subject mapping)
- Time on correct vs incorrect (based on evaluation)
- Topic-wise accuracy
- Attempt path (chronological activity sequence)

## Data Model (PostgreSQL via Prisma)

See the canonical models in `prisma/schema.prisma`:

- `SubjectCategory`
- `Question` (LaTeX text + JSON options + JSON correct answer)
- `TestSeries` + `TestQuestion` join table
- `StudentAttempt` (stores randomized question/option orders)
- `QuestionResponse` (upsert per attempt/question, accumulates time)
- `ActivityLog`

## Backend & API

Implemented as Next.js Route Handlers:

- `GET /api/tests`
- `POST /api/attempts` (creates attempt; randomizes question + option order)
- `GET /api/attempts/:attemptId` (hydrates exam state)
- `POST /api/attempts/:attemptId/responses` (upsert answer + palette state + time delta)
- `POST /api/attempts/:attemptId/events` (log events)
- `POST /api/attempts/:attemptId/submit` (score + finalize)
- `GET /api/attempts/:attemptId/report` (analytics)

## Offline Resilience

- Client persists an **attempt snapshot** to IndexedDB.
- Failed network writes are placed in an IndexedDB **outbox** and flushed on:
  - heartbeat
  - browser `online` event

## Infrastructure (Production Guidance)

For 100–150 concurrent students (reference design):

- **Web**: 2+ instances behind ALB (or autoscaled containers).
- **DB**: managed Postgres (RDS) with provisioned IOPS.
- **Cache**: Redis (session + hot question bank; optional for this repo).
- **CDN**: serve diagrams + MathJax assets via CDN.
- **Observability**: request tracing, error logging, and DB metrics.

## Security Notes

This project logs tab switches/fullscreen exits and blocks some default browser actions (context menu, basic copy/paste). These measures improve exam-like discipline but are not a substitute for secure proctoring.
