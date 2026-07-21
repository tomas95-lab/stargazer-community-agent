create table if not exists public.project_guideline_versions (
  id uuid primary key default gen_random_uuid(),
  project_key text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  author_email text not null default '',
  content text not null default '',
  characters integer not null default 0 check (characters >= 0),
  source_file_name text not null default '',
  change_summary text not null default '',
  restored_from uuid references public.project_guideline_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  check (project_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  check (octet_length(content) <= 5242880)
);

create index if not exists project_guideline_versions_project_idx
  on public.project_guideline_versions(project_key, created_at desc);

alter table public.project_guideline_versions enable row level security;

insert into public.project_guideline_versions (
  project_key, author_id, author_name, author_email, content, characters, change_summary, created_at
)
select distinct on (project_key)
  project_key, owner_id, owner_name, owner_email, project_guidelines, length(project_guidelines), 'Imported current guidelines.', updated_at
from public.qm_projects
where length(trim(project_guidelines)) > 0
  and not exists (
    select 1 from public.project_guideline_versions version
    where version.project_key = qm_projects.project_key
  )
order by project_key, updated_at desc;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (project_key ~ '^[a-z0-9][a-z0-9-]{1,63}$')
);

create index if not exists push_subscriptions_owner_idx
  on public.push_subscriptions(owner_id, project_key);

create index if not exists push_subscriptions_project_idx
  on public.push_subscriptions(project_key);

alter table public.push_subscriptions enable row level security;
