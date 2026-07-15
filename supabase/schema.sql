create extension if not exists pgcrypto;

create table if not exists public.qm_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  owner_name text not null default '',
  project_key text not null default 'stargazer',
  project_name text not null,
  community_base_url text not null default 'https://community.outlier.ai',
  community_category_id text not null,
  community_category_slug text not null default '',
  community_chat_channel_id text not null,
  discourse_username text not null default '',
  discourse_api_client_id text not null default 'daily-thread-bot',
  discourse_api_key_ciphertext text not null,
  project_guidelines text not null default '',
  war_room_link text not null default '',
  agent_mode text not null default 'supervised' check (agent_mode in ('draft', 'supervised', 'auto')),
  auto_reply_enabled boolean not null default false,
  min_confidence numeric not null default 0.5 check (min_confidence >= 0 and min_confidence <= 1),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qm_projects add column if not exists project_key text;

update public.qm_projects
set project_key = case
  when project_key is not null and btrim(project_key) <> '' then lower(regexp_replace(btrim(project_key), '[^a-zA-Z0-9]+', '-', 'g'))
  when lower(project_name) like '%stargazer%' then 'stargazer'
  else lower(regexp_replace(btrim(project_name), '[^a-zA-Z0-9]+', '-', 'g'))
end
where project_key is null or btrim(project_key) = '';

alter table public.qm_projects alter column project_key set default 'stargazer';
alter table public.qm_projects alter column project_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qm_projects_project_key_format'
  ) then
    alter table public.qm_projects
      add constraint qm_projects_project_key_format
      check (project_key ~ '^[a-z0-9][a-z0-9-]{1,63}$');
  end if;
end $$;

create index if not exists qm_projects_owner_id_idx on public.qm_projects(owner_id);
create index if not exists qm_projects_project_key_idx on public.qm_projects(project_key);

alter table public.qm_projects enable row level security;

drop policy if exists "QMs can read own projects" on public.qm_projects;
create policy "QMs can read own projects"
  on public.qm_projects for select
  using (auth.uid() = owner_id);

drop policy if exists "QMs can create own projects" on public.qm_projects;
create policy "QMs can create own projects"
  on public.qm_projects for insert
  with check (auth.uid() = owner_id);

drop policy if exists "QMs can update own projects" on public.qm_projects;
create policy "QMs can update own projects"
  on public.qm_projects for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "QMs can delete own projects" on public.qm_projects;
create policy "QMs can delete own projects"
  on public.qm_projects for delete
  using (auth.uid() = owner_id);

create table if not exists public.user_discourse_keys (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  discourse_api_key_ciphertext text not null,
  discourse_username text not null default '',
  api_version text not null default '',
  nonce text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_discourse_keys enable row level security;

create table if not exists public.discourse_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.qm_projects(id) on delete cascade,
  nonce text not null unique,
  private_key_ciphertext text not null,
  return_to text not null default '/project',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists discourse_auth_attempts_owner_id_idx on public.discourse_auth_attempts(owner_id);
create index if not exists discourse_auth_attempts_expires_at_idx on public.discourse_auth_attempts(expires_at);

alter table public.discourse_auth_attempts enable row level security;
