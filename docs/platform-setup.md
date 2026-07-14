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

`PUBLIC_BASE_URL` must be the public backend/app URL used in the Discourse callback, for example `https://your-app.vercel.app`. `FRONTEND_BASE_URL` is optional locally, and defaults to `http://localhost:5173` when the backend is running on `localhost:3001`.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor. It creates `public.qm_projects` and enables RLS so users can only access their own project rows.

It also creates:

- `public.discourse_auth_attempts` for temporary RSA private keys and nonces.
- `public.user_discourse_keys` for each user's latest connected Discourse User API Key, encrypted at rest.

## Flow

1. A QM signs up or logs in with Supabase Auth.
2. The QM clicks "Connect Discourse".
3. The backend creates a temporary RSA key pair and nonce, stores the encrypted private key with an expiration, and returns an Outlier Community authorization URL.
4. The QM authorizes the app at `https://community.outlier.ai/user-api-key/new`.
5. Discourse redirects to `/api/discourse-auth/callback` with an encrypted payload.
6. The backend decrypts the payload, verifies the nonce and expiration, stores the User API Key encrypted at rest, and deletes the temporary attempt.
7. The QM creates or updates a project from `/onboarding` or `/project`.
8. The UI sends `Authorization: Bearer <supabase-session>` and `X-Project-Id`.
9. The API resolves the project context, so the same agent code uses that project's category, channel, credentials, guidelines, links and memory.

## Legacy Compatibility

If a request does not include a Supabase session, the existing Stargazer `.env` configuration remains the fallback. Cron endpoints continue to use `CRON_SECRET`.
