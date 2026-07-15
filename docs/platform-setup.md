# QM Agent Platform Setup

This branch adds Supabase auth and per-QM project configuration.

## Required Environment Variables

Server:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_JWT_SECRET=
PLATFORM_ENCRYPTION_KEY=
PUBLIC_BASE_URL=
FRONTEND_BASE_URL=
```

Client:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

`PLATFORM_ENCRYPTION_KEY` is used to encrypt each QM's Discourse API key before it is stored. If it is missing, the server falls back to `SUPABASE_JWT_SECRET`, but a dedicated encryption key is preferred.

`PUBLIC_BASE_URL` should be the public backend/app URL, for example `https://your-app.vercel.app`. `FRONTEND_BASE_URL` is optional locally, and defaults to `http://localhost:5173` when the backend is running on `localhost:3001`.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor. It creates `public.qm_projects` and enables RLS so users can only access their own project rows.

It also creates:

- `public.discourse_auth_attempts` for temporary RSA private keys and nonces.
- `public.user_discourse_keys` for each user's latest connected Discourse User API Key, encrypted at rest.

## Flow

1. A QM signs up or logs in with Supabase Auth.
2. The QM clicks "Connect Discourse".
3. The backend creates a temporary RSA key pair and nonce, stores the encrypted private key with an expiration, and returns an Outlier Community authorization URL without `auth_redirect`.
4. The QM authorizes the app at `https://community.outlier.ai/user-api-key/new`.
5. The QM pastes the encrypted payload from Outlier Community into the app.
6. The backend decrypts the payload, verifies the nonce and expiration, stores the User API Key encrypted at rest, and deletes the temporary attempt.
7. The QM creates or updates a project from `/onboarding` or `/project`.
8. The UI sends `Authorization: Bearer <supabase-session>` and `X-Project-Id`.
9. The API resolves the project context, so the same agent code uses that project's category, channel, credentials, guidelines, links and memory.

## Project ID Model

Each QM connection has an internal UUID, but the shared community/project uses `project_key`, shown in the UI as `Project ID`.

Use the same Project ID for every QM working on the same community project. For Stargazer, use:

```txt
stargazer
```

Shared data such as topics, links, project memory, published markers and cron locks are scoped by Project ID. The special `stargazer` Project ID keeps using the legacy files:

```txt
data/topics.json
data/links.json
data/project-guidelines.txt
data/project-memory.json
```

Non-legacy projects use:

```txt
data/projects/<project-id>/topics.json
data/projects/<project-id>/links.json
data/projects/<project-id>/project-memory.json
```

## Cron Behavior

Cron endpoints remain single-project legacy by default. Creating a Stargazer project in the UI does not make Vercel cron run twice.

Default cron target:

```txt
Project ID: stargazer
Source: legacy env vars
```

You can force a specific project for a cron request:

```txt
/api/cron/community-agent/1000?project=<project-id>
/api/cron/daily-thread/1000?project=<project-id>
/api/cron/dm-review/1530?project=<project-id>
```

Multi-project cron fan-out is opt-in:

```env
PLATFORM_PROJECT_CRONS_ENABLED=true
PLATFORM_DM_CRONS_ENABLED=true
```

Project-level jobs (`daily-thread`, `community-agent`) run once per Project ID. DM review runs per QM connection because DMs belong to a QM user key.

Each cron run writes a lock by `job + project/qm + slot + Argentina date`, so duplicate requests for the same slot are skipped instead of posting twice.

## Legacy Compatibility

If a request does not include a Supabase session, the existing Stargazer `.env` configuration remains the fallback. Cron endpoints continue to use `CRON_SECRET`.
