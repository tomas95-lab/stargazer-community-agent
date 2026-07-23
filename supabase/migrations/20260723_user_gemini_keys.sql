alter table public.user_ai_keys
  add column if not exists gemini_api_key_ciphertext text not null default '',
  add column if not exists gemini_model text not null default 'gemini-3.5-flash-lite';

alter table public.user_ai_keys
  alter column gemini_model set default 'gemini-3.5-flash-lite';

update public.user_ai_keys
set gemini_model = 'gemini-3.5-flash-lite'
where gemini_model = 'gemini-2.5-flash-lite';
