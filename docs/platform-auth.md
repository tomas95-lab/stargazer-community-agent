# Platform Auth Setup

This branch adds Supabase Auth plus a per-user project registry.

## Environment

Server-only variables:

```bash
SUPABASE_PROJECT_ID=your_supabase_project_id
SUPABASE_URL=https://your_supabase_project_id.supabase.co
SUPABASE_SECRET_KEY=your_supabase_secret_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
```

Browser variables:

```bash
VITE_SUPABASE_URL=https://your_supabase_project_id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Do not put the secret key in a `VITE_` variable. Vite exposes `VITE_` values to the browser.

## Database

Run [supabase-platform.sql](./supabase-platform.sql) in the Supabase SQL editor before using the Platform Setup page.

The schema creates:

- `profiles`: one profile per Supabase Auth user.
- `categories`: Discourse category IDs and slugs.
- `channels`: Discourse chat channel IDs.
- `user_projects`: per-user project config, guidelines, and an encrypted Discourse key reference.

The Discourse API key itself is stored with Supabase Vault through `set_user_project_discourse_key`. The UI only receives `discourseApiKeyConfigured`.

## App Flow

- `/signup` creates a Supabase Auth user and sends the `name` metadata.
- `/login` creates a session and the UI sends the Supabase access token as `Authorization: Bearer ...`.
- `/api/platform/me` returns the current user profile and their projects.
- `/api/platform/projects` creates or updates a project and stores the Discourse key through Vault.

`X-Admin-Token` still works for legacy admin access when `ADMIN_TOKEN` is set, but Platform Setup requires Supabase login so projects are tied to a real user.
