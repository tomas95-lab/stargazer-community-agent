-- Stargazer platform auth and project registry.
-- Run this once in the Supabase SQL editor for the project used by this app.

create schema if not exists extensions;
create schema if not exists vault;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'user',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channels (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_projects (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category_id text not null references public.categories(id),
  channel_id text not null references public.channels(id),
  project_guidelines text not null default '',
  discourse_api_key_secret_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, channel_id)
);

create index if not exists user_projects_user_id_idx on public.user_projects(user_id);
create index if not exists user_projects_category_id_idx on public.user_projects(category_id);
create index if not exists user_projects_channel_id_idx on public.user_projects(channel_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists channels_set_updated_at on public.channels;
create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

drop trigger if exists user_projects_set_updated_at on public.user_projects;
create trigger user_projects_set_updated_at
before update on public.user_projects
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1),
      'User'
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.channels enable row level security;
alter table public.user_projects enable row level security;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists categories_authenticated_read on public.categories;
create policy categories_authenticated_read
on public.categories
for select
to authenticated
using (true);

drop policy if exists channels_authenticated_read on public.channels;
create policy channels_authenticated_read
on public.channels
for select
to authenticated
using (true);

drop policy if exists user_projects_own_select on public.user_projects;
create policy user_projects_own_select
on public.user_projects
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_projects_own_insert on public.user_projects;
create policy user_projects_own_insert
on public.user_projects
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_projects_own_update on public.user_projects;
create policy user_projects_own_update
on public.user_projects
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_projects_own_delete on public.user_projects;
create policy user_projects_own_delete
on public.user_projects
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.set_user_project_discourse_key(
  p_project_id uuid,
  p_secret text
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_name text := 'user_project_discourse_key:' || p_project_id::text;
  existing_secret_id uuid;
  project_owner uuid;
begin
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'Discourse API key is required.';
  end if;

  select user_id
  into project_owner
  from public.user_projects
  where id = p_project_id;

  if project_owner is null then
    raise exception 'Project not found.';
  end if;

  select id
  into existing_secret_id
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      p_secret,
      secret_name,
      'Discourse API key for user project ' || p_project_id::text
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      p_secret,
      secret_name,
      'Discourse API key for user project ' || p_project_id::text
    );
  end if;

  update public.user_projects
  set
    discourse_api_key_secret_name = secret_name,
    updated_at = now()
  where id = p_project_id;

  return secret_name;
end;
$$;

create or replace function public.get_user_project_discourse_key(
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_name text;
  secret_value text;
begin
  select discourse_api_key_secret_name
  into secret_name
  from public.user_projects
  where id = p_project_id;

  if secret_name is null or secret_name = '' then
    return null;
  end if;

  select decrypted_secret
  into secret_value
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;

  return secret_value;
end;
$$;

revoke all on function public.set_user_project_discourse_key(uuid, text) from public, anon, authenticated;
revoke all on function public.get_user_project_discourse_key(uuid) from public, anon, authenticated;

grant execute on function public.set_user_project_discourse_key(uuid, text) to service_role;
grant execute on function public.get_user_project_discourse_key(uuid) to service_role;
