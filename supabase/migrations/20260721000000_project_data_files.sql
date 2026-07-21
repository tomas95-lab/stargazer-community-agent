create table if not exists public.project_data_files (
  project_key text not null,
  file_path text not null,
  content_type text not null check (content_type in ('json', 'text')),
  content text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  content_sha256 text not null default '',
  last_write_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_key, file_path),
  check (project_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  check (file_path ~ '^(data|output)/[A-Za-z0-9._/-]+$'),
  check (file_path !~ '(^|/)\.\.?(/|$)'),
  check (octet_length(content) <= 5242880)
);

create index if not exists project_data_files_path_idx
  on public.project_data_files(project_key, file_path text_pattern_ops);

alter table public.project_data_files enable row level security;
