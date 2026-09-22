-- Technical diagnostics are disposable; fiscal audit evidence is not.
create table public.owner_log_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  technical_log_retention_days integer not null default 90 check (technical_log_retention_days between 7 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.technical_logs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_item_id uuid,
  level text not null check (level in ('info','warn','error')),
  code text not null check (length(btrim(code)) between 1 and 120),
  message text not null check (length(message) between 1 and 2000),
  sanitized_context jsonb not null default '{}'::jsonb check (jsonb_typeof(sanitized_context) = 'object'),
  created_at timestamptz not null default now()
);
create index technical_logs_expiry_idx on public.technical_logs(owner_id, created_at);

alter table public.owner_log_settings enable row level security;
alter table public.technical_logs enable row level security;
create policy "owners read own log settings" on public.owner_log_settings for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners read own technical logs" on public.technical_logs for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.owner_log_settings, public.technical_logs from anon, authenticated;
grant select on public.owner_log_settings, public.technical_logs to authenticated;

create function public.cleanup_expired_technical_logs(p_owner_id uuid, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_days integer;
  v_cutoff timestamptz;
  v_logs bigint;
  v_screenshots bigint;
begin
  select technical_log_retention_days into v_days from public.owner_log_settings where owner_id = p_owner_id;
  v_cutoff := p_now - make_interval(days => coalesce(v_days, 90));
  delete from public.technical_logs where owner_id = p_owner_id and created_at < v_cutoff;
  get diagnostics v_logs = row_count;
  -- Error screenshots are sanitized diagnostics. DAS, receipts, and reports are fiscal evidence and remain.
  delete from public.artifacts where owner_id = p_owner_id and kind = 'error_screenshot' and created_at < v_cutoff;
  get diagnostics v_screenshots = row_count;
  return jsonb_build_object('technicalLogsDeleted', v_logs, 'sanitizedScreenshotsDeleted', v_screenshots, 'cutoff', v_cutoff);
end;
$$;
revoke all on function public.cleanup_expired_technical_logs(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.cleanup_expired_technical_logs(uuid,timestamptz) to service_role;
