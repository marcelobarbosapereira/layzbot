alter table public.batch_items
  add column lease_owner_device_id uuid,
  add column lease_expires_at timestamptz,
  add column last_event_sequence bigint not null default 0 check (last_event_sequence >= 0),
  add foreign key (lease_owner_device_id, owner_id) references public.devices(id, owner_id),
  add check ((lease_owner_device_id is null) = (lease_expires_at is null));

create index batch_items_pending_claim_idx
  on public.batch_items(batch_id, created_at, id)
  where status = 'pending';
create index batch_items_active_lease_idx
  on public.batch_items(lease_owner_device_id, lease_expires_at)
  where lease_owner_device_id is not null;

create table public.batch_item_events (
  id bigint generated always as identity primary key,
  batch_item_id uuid not null,
  owner_id uuid not null references auth.users(id),
  device_id uuid not null,
  sequence bigint not null check (sequence > 0),
  expected_state text not null,
  next_state text not null,
  message text not null check (length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (batch_item_id, owner_id) references public.batch_items(id, owner_id),
  foreign key (device_id, owner_id) references public.devices(id, owner_id),
  unique (batch_item_id, sequence)
);
create index batch_item_events_owner_idx on public.batch_item_events(owner_id);
create index batch_item_events_device_idx on public.batch_item_events(device_id, batch_item_id);

alter table public.batch_item_events enable row level security;
create policy "owners read batch item events" on public.batch_item_events
  for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.batch_item_events from anon, authenticated;
grant select on public.batch_item_events to authenticated;

-- Task 6 snapshot immutability remains in force while these execution-only fields may change.
create or replace function private.protect_batch_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','lease_owner_device_id','lease_expires_at','last_event_sequence'])
    is distinct from
    (to_jsonb(old) - array['status','lease_owner_device_id','lease_expires_at','last_event_sequence'])
  then
    raise exception 'Confirmed snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.protect_batch_item_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Batch item events are append-only' using errcode = '23514';
end;
$$;
create trigger batch_item_events_append_only
  before update or delete on public.batch_item_events
  for each row execute function private.protect_batch_item_event();
revoke all on function private.protect_batch_item_event() from public, anon, authenticated;

create function public.claim_next_batch_item(p_device_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_device public.devices%rowtype;
  v_item public.batch_items%rowtype;
begin
  select d.* into v_device
  from public.devices d
  where d.id = p_device_id
    and d.token_hash = p_token_hash
    and p_token_hash ~ '^[a-f0-9]{64}$'
    and d.revoked_at is null;

  if not found then
    return jsonb_build_object('error', 'DEVICE_REVOKED');
  end if;

  -- Expiration is terminal. A timed-out item is never returned to pending.
  update public.batch_items i
  set status = 'interrupted', lease_owner_device_id = null, lease_expires_at = null
  from public.batches b
  where b.id = i.batch_id
    and b.owner_id = i.owner_id
    and b.device_id = p_device_id
    and i.owner_id = v_device.owner_id
    and i.lease_owner_device_id = p_device_id
    and i.status in ('authenticating','transmitting','awaiting_result')
    and i.lease_expires_at <= now();

  select i.* into v_item
  from public.batch_items i
  join public.batches b on b.id = i.batch_id and b.owner_id = i.owner_id
  where b.device_id = p_device_id
    and b.owner_id = v_device.owner_id
    and b.status = 'confirmed'
    and i.status = 'pending'
  order by i.created_at, i.id
  for update of i skip locked
  limit 1;

  if not found then return null; end if;

  update public.batch_items i
  set status = 'authenticating',
      lease_owner_device_id = p_device_id,
      lease_expires_at = now() + interval '90 seconds'
  where i.id = v_item.id and i.owner_id = v_item.owner_id
  returning i.* into v_item;

  return jsonb_build_object(
    'itemId', v_item.id,
    'batchId', v_item.batch_id,
    'state', v_item.status,
    'leaseExpiresAt', v_item.lease_expires_at,
    'competence', v_item.competence,
    'revenueCents', v_item.revenue_cents,
    'activity', v_item.activity,
    'taxOption', v_item.tax_option,
    'municipalityCode', v_item.municipality_code,
    'parameters', v_item.parameters,
    'taxpayer', jsonb_build_object('id',v_item.taxpayer_id,'name',v_item.taxpayer_name,'document',v_item.taxpayer_document),
    'responsible', jsonb_build_object('id',v_item.responsible_id,'name',v_item.responsible_name,'document',v_item.responsible_document)
  );
end;
$$;

create function public.append_batch_item_event(
  p_item_id uuid,
  p_device_id uuid,
  p_token_hash text,
  p_expected_state text,
  p_next_state text,
  p_message text,
  p_sequence bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item public.batch_items%rowtype;
  v_existing public.batch_item_events%rowtype;
  v_message text;
  v_now timestamptz := now();
begin
  v_message := btrim(regexp_replace(regexp_replace(coalesce(p_message,''), '[[:cntrl:]]', '', 'g'), '[[:space:]]+', ' ', 'g'));
  if length(v_message) not between 1 and 1000 or p_sequence is null or p_sequence <= 0 then
    return jsonb_build_object('error','INVALID_REQUEST');
  end if;

  select i.* into v_item from public.batch_items i
  where i.id = p_item_id
  for update;
  if not found then return jsonb_build_object('error','LEASE_LOST'); end if;

  if not exists (
    select 1 from public.devices d
    where d.id = p_device_id and d.owner_id = v_item.owner_id
      and d.token_hash = p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$' and d.revoked_at is null
  ) then
    return jsonb_build_object('error','DEVICE_REVOKED');
  end if;

  select e.* into v_existing from public.batch_item_events e
  where e.batch_item_id = p_item_id and e.sequence = p_sequence;
  if found then
    if v_existing.device_id = p_device_id
      and v_existing.expected_state = p_expected_state
      and v_existing.next_state = p_next_state
      and v_existing.message = v_message
    then
      return jsonb_build_object('itemId',p_item_id,'state',v_existing.next_state,'sequence',v_existing.sequence,'replayed',true);
    end if;
    return jsonb_build_object('error','DUPLICATE_SEQUENCE');
  end if;

  if v_item.lease_owner_device_id is distinct from p_device_id then
    return jsonb_build_object('error','LEASE_LOST');
  end if;
  if v_item.lease_expires_at <= v_now then
    update public.batch_items set status='interrupted',lease_owner_device_id=null,lease_expires_at=null where id=p_item_id;
    return jsonb_build_object('error','LEASE_LOST');
  end if;
  if p_sequence <> v_item.last_event_sequence + 1 then
    return jsonb_build_object('error','INVALID_SEQUENCE');
  end if;
  if v_item.status is distinct from p_expected_state
    or p_expected_state not in ('authenticating','transmitting','awaiting_result')
    or not (
      p_next_state = p_expected_state
      or (p_expected_state='authenticating' and p_next_state in ('transmitting','interrupted'))
      or (p_expected_state='transmitting' and p_next_state in ('awaiting_result','interrupted'))
      or (p_expected_state='awaiting_result' and p_next_state in ('completed','interrupted'))
    )
  then
    return jsonb_build_object('error','INVALID_TRANSITION');
  end if;

  insert into public.batch_item_events(batch_item_id,owner_id,device_id,sequence,expected_state,next_state,message,created_at)
  values(p_item_id,v_item.owner_id,p_device_id,p_sequence,p_expected_state,p_next_state,v_message,v_now);

  update public.batch_items
  set status = p_next_state,
      last_event_sequence = p_sequence,
      lease_owner_device_id = case when p_next_state in ('completed','interrupted') then null else p_device_id end,
      lease_expires_at = case when p_next_state in ('completed','interrupted') then null else v_now + interval '90 seconds' end
  where id = p_item_id;

  return jsonb_build_object('itemId',p_item_id,'state',p_next_state,'sequence',p_sequence,'replayed',false);
end;
$$;

revoke all on function public.claim_next_batch_item(uuid,text) from public;
revoke all on function public.append_batch_item_event(uuid,uuid,text,text,text,text,bigint) from public;
grant execute on function public.claim_next_batch_item(uuid,text) to anon, authenticated;
grant execute on function public.append_batch_item_event(uuid,uuid,text,text,text,text,bigint) to anon, authenticated;
