-- Server-only: no client roles can read ciphertext, query definitions, or job handles.
create table if not exists public.private_redash_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  key_ciphertext text not null default '',
  queries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint redash_tomas_only check (owner_id = 'b6f44318-a33e-4d01-958c-5d591d9267bc'::uuid)
);
alter table public.private_redash_connections enable row level security;
revoke all on public.private_redash_connections from anon, authenticated;
grant all on public.private_redash_connections to service_role;
