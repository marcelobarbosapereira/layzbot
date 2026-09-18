-- Minimal device identity needed by confirmation. Task 7 adds enrollment/authentication.
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(btrim(name)) > 0),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index devices_owner_idx on public.devices(owner_id);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  device_id uuid not null,
  competence text not null check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'confirmed',
  item_count integer not null check (item_count > 0),
  total_revenue_cents bigint not null check (total_revenue_cents between 0 and 9007199254740991),
  confirmed_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (device_id, owner_id) references public.devices(id, owner_id)
);
create index batches_owner_confirmed_idx on public.batches(owner_id, confirmed_at desc);
create index batches_device_idx on public.batches(device_id, owner_id);

create table public.batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  owner_id uuid not null references auth.users(id),
  assessment_id uuid not null references public.monthly_assessments(id),
  competence text not null,
  revenue_cents bigint not null check (revenue_cents between 0 and 9007199254740991),
  activity public.simple_activity not null,
  tax_option text not null,
  municipality_code text,
  parameters jsonb not null,
  taxpayer_id uuid not null,
  taxpayer_name text not null,
  taxpayer_document text not null,
  responsible_id uuid not null,
  responsible_name text not null,
  responsible_document text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (batch_id, assessment_id),
  foreign key (batch_id, owner_id) references public.batches(id, owner_id)
);
create index batch_items_owner_idx on public.batch_items(owner_id);
create index batch_items_assessment_idx on public.batch_items(assessment_id);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  batch_item_id uuid not null,
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('das','receipt','error_screenshot','report')),
  object_path text not null check (split_part(object_path, '/', 1) = owner_id::text and length(object_path) > 37),
  original_name text not null check (length(original_name) > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  foreign key (batch_item_id, owner_id) references public.batch_items(id, owner_id),
  unique (object_path)
);
create index artifacts_item_idx on public.artifacts(batch_item_id, owner_id);
create index artifacts_owner_idx on public.artifacts(owner_id);

alter table public.devices enable row level security;
alter table public.batches enable row level security;
alter table public.batch_items enable row level security;
alter table public.artifacts enable row level security;
create policy "owners read devices" on public.devices for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners read batches" on public.batches for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners read batch items" on public.batch_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners read artifacts" on public.artifacts for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.devices, public.batches, public.batch_items, public.artifacts from anon, authenticated;
grant select on public.devices, public.batches, public.batch_items, public.artifacts to authenticated;

-- Preserve snapshot fields even for future privileged execution-state updates.
create function private.protect_batch_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Confirmed snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger batch_snapshot_immutable before update on public.batches for each row execute function private.protect_batch_snapshot();
create trigger batch_item_snapshot_immutable before update on public.batch_items for each row execute function private.protect_batch_snapshot();
revoke all on function private.protect_batch_snapshot() from public, anon, authenticated;

-- A definer implementation is necessary: clients may read snapshots but never insert or edit them.
create function private.confirm_batch(p_competence text, p_device_id uuid, p_assessment_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_rows jsonb := '[]'::jsonb;
  v_row record;
  v_total bigint := 0;
  v_count integer := 0;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_competence is null or p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or coalesce(cardinality(p_assessment_ids),0) = 0
    or cardinality(p_assessment_ids) <> (select count(distinct id) from unnest(p_assessment_ids) id)
  then raise exception 'Invalid selection' using errcode = '22023'; end if;
  perform 1 from public.devices d where d.id=p_device_id and d.owner_id=v_owner
    and d.revoked_at is null and d.last_seen_at >= now() - interval '90 seconds'
    for share;
  if not found then raise exception 'Device unavailable' using errcode = '22023'; end if;

  -- Lock every source row used by the snapshot, then write exactly the captured values.
  for v_row in
    select a.id assessment_id, a.competence, a.revenue_cents,
      p.activity, p.tax_option, p.municipality_code, p.parameters,
      t.id taxpayer_id, t.name taxpayer_name, t.document taxpayer_document,
      r.id responsible_id, r.name responsible_name, r.document responsible_document
    from public.monthly_assessments a
    join public.taxpayers t on t.id=a.taxpayer_id and t.owner_id=v_owner
    join public.simple_profiles p on p.taxpayer_id=t.id and p.owner_id=v_owner
    join public.responsibles r on r.id=t.responsible_id and r.owner_id=v_owner
    join public.taxpayer_obligations o on o.taxpayer_id=t.id and o.owner_id=v_owner and o.obligation='simples'
    where a.id=any(p_assessment_ids) and a.owner_id=v_owner and a.competence=p_competence
      and a.obligation='simples' and a.revenue_cents is not null and a.revenue_cents >= 0
      and t.active and r.active and o.active
    order by a.id for share of a,t,p,r,o
  loop
    if v_row.revenue_cents > 9007199254740991 - v_total then
      raise exception 'Revenue exceeds supported integer range' using errcode='22023';
    end if;
    v_total := v_total + v_row.revenue_cents;
    v_count := v_count + 1;
    v_rows := v_rows || jsonb_build_array(to_jsonb(v_row));
  end loop;
  if v_count <> cardinality(p_assessment_ids) then
    raise exception 'Invalid or inactive assessment selection' using errcode = '22023';
  end if;
  insert into public.batches(id,owner_id,device_id,competence,item_count,total_revenue_cents)
    values(v_batch,v_owner,p_device_id,p_competence,v_count,v_total);
  insert into public.batch_items(batch_id,owner_id,assessment_id,competence,revenue_cents,activity,tax_option,
    municipality_code,parameters,taxpayer_id,taxpayer_name,taxpayer_document,responsible_id,responsible_name,responsible_document)
  select v_batch,v_owner,x.assessment_id,x.competence,x.revenue_cents,x.activity,x.tax_option,
    x.municipality_code,x.parameters,x.taxpayer_id,x.taxpayer_name,x.taxpayer_document,x.responsible_id,x.responsible_name,x.responsible_document
  from jsonb_to_recordset(v_rows) as x(assessment_id uuid,competence text,revenue_cents bigint,activity public.simple_activity,
    tax_option text,municipality_code text,parameters jsonb,taxpayer_id uuid,taxpayer_name text,taxpayer_document text,
    responsible_id uuid,responsible_name text,responsible_document text);
  return jsonb_build_object('batchId',v_batch,'itemCount',v_count,'totalRevenueCents',v_total);
end;
$$;
create function public.confirm_batch(p_competence text, p_device_id uuid, p_assessment_ids uuid[])
returns jsonb language sql security invoker set search_path = '' as $$
  select private.confirm_batch(p_competence,p_device_id,p_assessment_ids)
$$;
revoke all on function private.confirm_batch(text,uuid,uuid[]) from public, anon;
revoke all on function public.confirm_batch(text,uuid,uuid[]) from public, anon;
grant execute on function private.confirm_batch(text,uuid,uuid[]) to authenticated;
grant execute on function public.confirm_batch(text,uuid,uuid[]) to authenticated;
