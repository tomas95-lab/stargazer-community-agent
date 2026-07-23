alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_status_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_status_check
  check (status in ('success', 'error', 'blocked', 'reserved'));

create index if not exists ai_usage_events_project_idx
  on public.ai_usage_events(project_key, created_at desc);

create or replace function public.reserve_ai_usage(
  p_reservation_id uuid,
  p_project_key text,
  p_owner_id uuid,
  p_feature text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_global_call_limit integer,
  p_global_token_limit integer,
  p_project_call_limit integer,
  p_project_token_limit integer,
  p_owner_call_limit integer,
  p_owner_token_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local_date date := (now() at time zone 'America/Los_Angeles')::date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_expected_tokens integer := greatest(0, coalesce(p_input_tokens, 0)) + greatest(0, coalesce(p_output_tokens, 0));
  v_global_calls integer;
  v_global_tokens bigint;
  v_project_calls integer;
  v_project_tokens bigint;
  v_owner_calls integer := 0;
  v_owner_tokens bigint := 0;
  v_scope text;
  v_reason text;
begin
  if p_reservation_id is null or coalesce(trim(p_project_key), '') = '' then
    raise exception 'A reservation ID and project key are required.';
  end if;

  v_day_start := v_local_date::timestamp at time zone 'America/Los_Angeles';
  v_day_end := (v_local_date + 1)::timestamp at time zone 'America/Los_Angeles';
  perform pg_advisory_xact_lock(hashtext('platform-gemini:' || v_local_date::text));

  select count(*)::integer, coalesce(sum(input_tokens + output_tokens), 0)::bigint
    into v_global_calls, v_global_tokens
    from public.ai_usage_events
    where created_at >= v_day_start
      and created_at < v_day_end
      and status in ('success', 'error', 'reserved');

  select count(*)::integer, coalesce(sum(input_tokens + output_tokens), 0)::bigint
    into v_project_calls, v_project_tokens
    from public.ai_usage_events
    where project_key = p_project_key
      and created_at >= v_day_start
      and created_at < v_day_end
      and status in ('success', 'error', 'reserved');

  if p_owner_id is not null then
    select count(*)::integer, coalesce(sum(input_tokens + output_tokens), 0)::bigint
      into v_owner_calls, v_owner_tokens
      from public.ai_usage_events
      where owner_id = p_owner_id
        and created_at >= v_day_start
        and created_at < v_day_end
        and status in ('success', 'error', 'reserved');
  end if;

  if p_global_call_limit > 0 and v_global_calls + 1 > p_global_call_limit then
    v_scope := 'platform';
    v_reason := 'The platform Gemini daily call limit has been reached. This message requires human review.';
  elsif p_global_token_limit > 0 and v_global_tokens + v_expected_tokens > p_global_token_limit then
    v_scope := 'platform';
    v_reason := 'The platform Gemini daily token budget has been reached. This message requires human review.';
  elsif p_project_call_limit > 0 and v_project_calls + 1 > p_project_call_limit then
    v_scope := 'project';
    v_reason := 'This project has reached its Gemini daily call limit. This message requires human review.';
  elsif p_project_token_limit > 0 and v_project_tokens + v_expected_tokens > p_project_token_limit then
    v_scope := 'project';
    v_reason := 'This project has reached its Gemini daily token budget. This message requires human review.';
  elsif p_owner_id is not null and p_owner_call_limit > 0 and v_owner_calls + 1 > p_owner_call_limit then
    v_scope := 'QM';
    v_reason := 'This QM has reached the Gemini daily call limit. This message requires human review.';
  elsif p_owner_id is not null and p_owner_token_limit > 0 and v_owner_tokens + v_expected_tokens > p_owner_token_limit then
    v_scope := 'QM';
    v_reason := 'This QM has reached the Gemini daily token budget. This message requires human review.';
  end if;

  if v_reason is not null then
    insert into public.ai_usage_events (
      id, project_key, owner_id, feature, model, input_tokens, output_tokens, status
    ) values (
      p_reservation_id, p_project_key, p_owner_id, p_feature, p_model,
      greatest(0, coalesce(p_input_tokens, 0)), 0, 'blocked'
    );
    return jsonb_build_object('allowed', false, 'scope', v_scope, 'reason', v_reason);
  end if;

  insert into public.ai_usage_events (
    id, project_key, owner_id, feature, model, input_tokens, output_tokens, status
  ) values (
    p_reservation_id, p_project_key, p_owner_id, p_feature, p_model,
    greatest(0, coalesce(p_input_tokens, 0)),
    greatest(0, coalesce(p_output_tokens, 0)),
    'reserved'
  );

  return jsonb_build_object('allowed', true, 'reservation_id', p_reservation_id);
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer) from public;
revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer) from anon;
revoke all on function public.reserve_ai_usage(uuid, text, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer) from authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer) to service_role;
