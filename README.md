# Community Agent

Multi-project platform for community operations. It centralizes Community and DM inboxes, daily threads, comms, project guidelines, review workflows, schedules, quality metrics, and AI-assisted replies.

## Architecture

| Path | Responsibility |
|---|---|
| `api/` | Vercel serverless entrypoint |
| `server/` | Express API, authentication, project access, and routes |
| `src/` | Discourse client, automation jobs, AI runtime, and domain logic |
| `ui/` | React and Vite dashboard |
| `supabase/` | Database schema and migrations |
| `data/` | Local development and migration fixtures |
| `docs/examples/` | Import examples for topics and comms |

Production data belongs in Supabase. `output/` is runtime-only, ignored by Git, and must never be used as durable production storage.

## Requirements

- Node.js 20 or newer
- A Supabase project
- A Discourse User API Key connected through the onboarding flow
- One server-side Gemini API key for the platform

## Local Setup

```bash
npm install
npm --prefix ui install
cp .env.example .env
npm run dev
```

The dashboard runs at `http://localhost:5173` and proxies API requests to `http://localhost:3001`.

Apply [supabase/schema.sql](supabase/schema.sql) and every file under `supabase/migrations/` before using the platform.

## Main Commands

```bash
npm run dev             # API and UI
npm test                # TypeScript build and tests
npm run ui:build        # Production UI build
npm run job:daily       # Daily-thread publisher
npm run job:dms         # DM review
npm run jobs:all        # Scheduled community jobs
npm run training:scan   # Refresh project memory from recent history
npm run storage:verify  # Verify legacy data migration
```

The MCP command remains available through `npm run mcp`.

## Data And Access

- Supabase sessions authenticate dashboard users.
- Project memberships and roles control shared project access.
- QMs sharing a Project ID share project content, guidelines, and configuration.
- Discourse credentials are encrypted server-side and are never returned to the browser.
- Gemini is managed centrally with atomic daily limits for the platform, each project, and each QM.
- Runtime events, locks, schedules, review state, and AI usage are stored in Supabase.
- GitHub is source control only. The GitHub storage backend exists solely for migration.

## Imports

- Topic example: [docs/examples/topics.json](docs/examples/topics.json)
- Comms example: [docs/examples/comms.json](docs/examples/comms.json)

The dashboard validates uploaded topic, comms, and guideline files before saving them.

## Deployment

Vercel serves the UI and API. Scheduled routes require `CRON_SECRET`; external schedulers must send it using the header expected by the API. Project status is enforced by every automation job, so paused, completed, and archived projects are skipped.

Do not commit `.env`, browser profiles, generated builds, runtime output, downloaded guidelines, or contributor conversations.

### Project Availability Pilot

For Tomas's explicitly enabled Redash project connection, every daily-thread and Community cron execution checks availability. The dashboard's **Check task availability** button runs the same check on demand and sends the notice if needed. Both paths share an atomic concurrency lock, not a once-per-day limit. It uses approved read-only SQL on the configured project, without AI calls or contributor lookups. Availability includes only pending, unassigned work in L-1 and L0; higher review layers never count. An empty batch triggers one English notice in the project's configured Community channel; no task counts are disclosed.

The notice is not repeated while the queue remains empty. A successful check that observes available work resets it for the next batch. Paused projects, demo accounts, and other users cannot publish these notices. Cron checks respect suggestion mode and project schedules; explicitly requested manual checks can run outside those hours. Failed or ambiguous queries never trigger a notice. Uncertain message delivery requires manual verification instead of an automatic resend.

The check reuses the existing cron schedules and Supabase runtime storage; no additional scheduler or environment variable is required. Preparing diagnostic queries disables their automation until it is explicitly enabled again.

## Verification

```bash
npm test
npm run ui:build
```
