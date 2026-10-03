# JEE Test Series (CBT Mock)

Next.js + PostgreSQL (Prisma) mock-test platform that implements a JEE-style CBT engine:

- 3-hour style master timer (auto-submit on zero)
- Bento-grid **question palette** with JEE state colors
- LaTeX rendering via MathJax v3
- Event-based time tracking + basic post-test analytics
- Offline-first queue (IndexedDB outbox) + heartbeat sync

See the architecture blueprint in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Advanced paper authoring schema is documented in [docs/advanced-paper/README.md](docs/advanced-paper/README.md).

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
- `DIRECT_URL` (recommended for Prisma CLI and Vercel builds when using hosted PostgreSQL)
- `REDIS_URL` (optional; Redis isn’t required for the current feature set)
- `NEXT_PUBLIC_IDLE_TIMEOUT_MS` (default 300000)
- `NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS` (default 30000)
- `CLOUDINARY_CLOUD_NAME` (required for admin image upload)
- `CLOUDINARY_API_KEY` (required for admin image upload)
- `CLOUDINARY_API_SECRET` (required for admin image upload)

Admin raw editor supports drag-and-drop / file upload for question and option images.
Uploaded images are stored in Cloudinary under `testseries/<folder-name-from-editor>`.

### Import from Notion (Seed Your Own Tests)

This repo supports seeding tests/questions from a Notion **database** (not a plain page).

Full Notion setup + schema reference: [docs/NOTION.md](docs/NOTION.md).

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
- `Option A Image URL` / `Option B Image URL` / `Option C Image URL` / `Option D Image URL` (rich text or url; MCQ only; optional; leave empty or `null` for no image)
- `Correct Option` (select: A/B/C/D; MCQ only)
- `Correct Integer` (number; Numerical only; must be an integer)
- `Question URLs` (rich text or url; optional; comma/newline/semicolon separated image URLs)
	- Backward compatible alias: `Image URLs`
- `Difficulty` (number; optional)

4) Run the import:

`npm run db:seed:notion`

### Production Seed (Advanced Papers via Notion)

Use this flow to seed the production database with Advanced paper set data from one or more Notion database IDs.

Required env vars:

- `DATABASE_URL_PROD` (or `PROD_DATABASE_URL`)
- `NOTION_TOKEN`
- `CONFIRM_PROD_SEED=yes`
- `ADV_NOTION_DATABASE_IDS` (comma-separated Notion DB IDs)

Command:

`CONFIRM_PROD_SEED=yes ADV_NOTION_DATABASE_IDS=<id1>,<id2> npm run db:seed:prod:v2-paper12`

Example:

`CONFIRM_PROD_SEED=yes ADV_NOTION_DATABASE_IDS=338a562359c28098916cf99a73e378a5,339a562359c28040b74dca2fe1e69c2b npm run db:seed:prod:v2-paper12`

What this command does:

- Points Prisma to production DB using `DATABASE_URL_PROD`.
- Runs base seed first (required entities like marking schemes/subjects).
- Runs Advanced v2 seed for each Notion DB ID in `ADV_NOTION_DATABASE_IDS`.

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

## Exam UI: Question Media and Report Visibility

### Question and option images

Question media is rendered through the reusable `QuestionMediaLayout` and `MediaImageGroup` components. They are used in exam attempts, reports, and paper previews.

- With multiple question images, all images appear above the question text in one horizontal row by default. Their aspect ratios do not change this layout, and the group does not use a carousel or horizontal scrolling. A caller can set `maxColumns` to wrap a larger group into additional rows.
- With one question image, its natural width-to-height ratio controls placement. At `2:1` or wider, the image appears above the question text. Below `2:1`, the question text is on the left and the image is on the right on wider screens; narrow screens stack them.
- Images keep their original proportions inside a frame (`object-fit: contain`), so they are not cropped. The default frame ratio is `1.4:1` and the default maximum image height is `320px`; callers can customize the ratio, height, and column count through component props.
- Clicking a question image opens it in a large overlay for reading. Pressing Escape or the close button dismisses it. This behavior applies to question images only; option images do not open the overlay.
- On wider screens, answer options use a two-column grid (two options per row). Images within an option can use up to two columns and wrap as needed; narrow screens stack option cards and option images.

### Math text size

MathJax-rendered LaTeX is displayed at `1.25em` relative to its surrounding text. This sizing rule applies to rendered math; regular text keeps its existing size.

### Live attempt reports

- Students can open their report after the attempt is `SUBMITTED` or `AUTO_SUBMITTED`. While it is `IN_PROGRESS`, student report pages redirect to the attempt and report API requests are denied.
- Admins can review an attempt live or after submission through the admin candidate report pages under `/admin/candidate/...`.
- Admin accounts use the same ownership and submission rules as students on the normal attempt and report routes. An admin taking their own paper is treated as its student until they enter an explicit admin report view.
- Admins cannot open another candidate’s live exam page. Live exam routes and response APIs remain scoped to the authenticated attempt owner. The V2 live exam client also loads from a separate endpoint that omits correct answers and scoring rules.

## Notes

- This repository includes basic exam-like restrictions (context menu + basic copy/paste blocking) and logs tab/fullscreen changes; it is not a secure proctoring system.

## Vercel + Azure Database for PostgreSQL

This project can use Azure Database for PostgreSQL Flexible Server without changing its Prisma schema. Add the server's connection strings to the Vercel project environment:

- Set `DATABASE_URL` to the runtime connection string.
- Set `DIRECT_URL` to the direct server connection for Prisma CLI tasks such as `prisma migrate deploy`.
- Include `sslmode=require` in both URLs so connections use TLS. Azure's quickstart uses this mode; certificate-verifying modes provide stronger server identity checks when the application's trust store and network setup support them.
- `publicNetworkAccess: Enabled` exposes a public endpoint, but Azure firewall rules still control which client IPs can connect. Allow the required local and deployment egress IPs.

For the server `jeetestseries` (`Standard_B1ms`, Burstable), use port `5432` for both URLs. Azure's built-in PgBouncer isn't supported on the Burstable tier, so port `6432` isn't available for this server. On a supported compute tier, Azure PgBouncer uses transaction pooling on port `6432`; keep migrations on the direct `5432` endpoint.

Use this URL shape, replacing the password and database name. Create a `testseries` database first, or substitute the name of a database that already exists. URL-encode special characters in the password.

```dotenv
DATABASE_URL="postgresql://senatenikhil:<URL-ENCODED-PASSWORD>@jeetestseries.postgres.database.azure.com:5432/testseries?schema=public&sslmode=require"
DIRECT_URL="postgresql://senatenikhil:<URL-ENCODED-PASSWORD>@jeetestseries.postgres.database.azure.com:5432/testseries?schema=public&sslmode=require"
```

The Vercel build script runs migrations before `next build`, and Prisma CLI prefers `DIRECT_URL` when present.

Azure references: [Flexible Server connection quickstart](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/quickstart-create-server), [TLS guidance](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking-ssl-tls), [built-in PgBouncer support and limits](https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer), and [firewall rules](https://learn.microsoft.com/en-us/azure/postgresql/security/security-firewall-rules).
