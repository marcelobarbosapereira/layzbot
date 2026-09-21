-- Per-item overrides retain the original batch assignment for existing snapshots.
alter table public.batch_items add column assigned_device_id uuid;
alter table public.batch_items add foreign key (assigned_device_id, owner_id) references public.devices(id, owner_id);
create index batch_items_assigned_pending_idx on public.batch_items(assigned_device_id, created_at, id) where status = 'pending';

create or replace function private.protect_batch_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status','lease_owner_device_id','lease_expires_at','last_event_sequence','assigned_device_id'])
    is distinct from
    (to_jsonb(old) - array['status','lease_owner_device_id','lease_expires_at','last_event_sequence','assigned_device_id'])
  then
    raise exception 'Confirmed snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The batch ID lets Realtime filter event rows before delivering them.
alter table public.batch_item_events add column batch_id uuid;
alter table public.batch_item_events add column actor_user_id uuid references auth.users(id);
drop trigger batch_item_events_append_only on public.batch_item_events;
update public.batch_item_events e set batch_id=i.batch_id from public.batch_items i where i.id=e.batch_item_id;
create trigger batch_item_events_append_only before update or delete on public.batch_item_events
  for each row execute function private.protect_batch_item_event();
alter table public.batch_item_events alter column batch_id set not null;
alter table public.batch_item_events add foreign key (batch_id, owner_id) references public.batches(id, owner_id);
create index batch_item_events_batch_idx on public.batch_item_events(batch_id, id);

create function private.set_batch_item_event_batch_id() returns trigger
language plpgsql set search_path = '' as $$
declare v_batch uuid;
begin
  select i.batch_id into v_batch from public.batch_items i where i.id=new.batch_item_id and i.owner_id=new.owner_id;
  if v_batch is null then raise exception 'Item unavailable' using errcode='23503'; end if;
  new.batch_id := v_batch;
  return new;
end;
$$;
create trigger batch_item_event_batch_id before insert on public.batch_item_events
  for each row execute function private.set_batch_item_event_batch_id();
revoke all on function private.set_batch_item_event_batch_id() from public, anon, authenticated;

-- Replacing the claim function only changes the assignment predicate. Token, owner and lease rules remain.
create or replace function public.claim_next_batch_item(p_device_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_device public.devices%rowtype;
  v_item public.batch_items%rowtype;
begin
  select d.* into v_device from public.devices d
  where d.id=p_device_id and d.token_hash=p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$' and d.revoked_at is null;
  if not found then return jsonb_build_object('error','DEVICE_REVOKED'); end if;

  update public.batch_items i
  set status='interrupted',lease_owner_device_id=null,lease_expires_at=null
  from public.batches b
  where b.id=i.batch_id and b.owner_id=i.owner_id
    and coalesce(i.assigned_device_id,b.device_id)=p_device_id
    and i.owner_id=v_device.owner_id and i.lease_owner_device_id=p_device_id
    and i.status in ('authenticating','transmitting','awaiting_result') and i.lease_expires_at<=now();

  select i.* into v_item from public.batch_items i
  join public.batches b on b.id=i.batch_id and b.owner_id=i.owner_id
  where coalesce(i.assigned_device_id,b.device_id)=p_device_id
    and b.owner_id=v_device.owner_id and b.status='confirmed' and i.status='pending'
  order by i.created_at,i.id for update of i skip locked limit 1;
  if not found then return null; end if;

  update public.batch_items i
  set status='authenticating',lease_owner_device_id=p_device_id,lease_expires_at=now()+interval '90 seconds'
  where i.id=v_item.id and i.owner_id=v_item.owner_id returning i.* into v_item;
  return jsonb_build_object(
    'itemId',v_item.id,'batchId',v_item.batch_id,'state',v_item.status,'leaseExpiresAt',v_item.lease_expires_at,
    'nextSequence',v_item.last_event_sequence+1,
    'competence',v_item.competence,'revenueCents',v_item.revenue_cents,'activity',v_item.activity,
    'taxOption',v_item.tax_option,'municipalityCode',v_item.municipality_code,'parameters',v_item.parameters,
    'taxpayer',jsonb_build_object('id',v_item.taxpayer_id,'name',v_item.taxpayer_name,'document',v_item.taxpayer_document),
    'responsible',jsonb_build_object('id',v_item.responsible_id,'name',v_item.responsible_name,'document',v_item.responsible_document)
  );
end;
$$;

-- Interventions and failures are terminal for the current lease and visible in live progress.
create or replace function public.append_batch_item_event(
  p_item_id uuid,p_device_id uuid,p_token_hash text,p_expected_state text,
  p_next_state text,p_message text,p_sequence bigint
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
  select i.* into v_item from public.batch_items i where i.id=p_item_id for update;
  if not found then return jsonb_build_object('error','LEASE_LOST'); end if;
  if not exists (
    select 1 from public.devices d where d.id=p_device_id and d.owner_id=v_item.owner_id
      and d.token_hash=p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$' and d.revoked_at is null
  ) then return jsonb_build_object('error','DEVICE_REVOKED'); end if;
  select e.* into v_existing from public.batch_item_events e
    where e.batch_item_id=p_item_id and e.sequence=p_sequence;
  if found then
    if v_existing.device_id=p_device_id and v_existing.expected_state=p_expected_state
      and v_existing.next_state=p_next_state and v_existing.message=v_message then
      return jsonb_build_object('itemId',p_item_id,'state',v_existing.next_state,'sequence',v_existing.sequence,'replayed',true);
    end if;
    return jsonb_build_object('error','DUPLICATE_SEQUENCE');
  end if;
  if v_item.lease_owner_device_id is distinct from p_device_id then return jsonb_build_object('error','LEASE_LOST'); end if;
  if v_item.lease_expires_at<=v_now then
    update public.batch_items set status='interrupted',lease_owner_device_id=null,lease_expires_at=null where id=p_item_id;
    return jsonb_build_object('error','LEASE_LOST');
  end if;
  if p_sequence<>v_item.last_event_sequence+1 then return jsonb_build_object('error','INVALID_SEQUENCE'); end if;
  if v_item.status is distinct from p_expected_state
    or p_expected_state not in ('authenticating','transmitting','awaiting_result')
    or not (
      p_next_state=p_expected_state
      or p_next_state in ('needs_attention','failed','interrupted')
      or (p_expected_state='authenticating' and p_next_state='transmitting')
      or (p_expected_state='transmitting' and p_next_state='awaiting_result')
      or (p_expected_state='awaiting_result' and p_next_state='completed')
    ) then return jsonb_build_object('error','INVALID_TRANSITION'); end if;
  insert into public.batch_item_events(batch_item_id,owner_id,device_id,sequence,expected_state,next_state,message,created_at)
    values(p_item_id,v_item.owner_id,p_device_id,p_sequence,p_expected_state,p_next_state,v_message,v_now);
  update public.batch_items
    set status=p_next_state,last_event_sequence=p_sequence,
      lease_owner_device_id=case when p_next_state in ('completed','interrupted','needs_attention','failed') then null else p_device_id end,
      lease_expires_at=case when p_next_state in ('completed','interrupted','needs_attention','failed') then null else v_now+interval '90 seconds' end
    where id=p_item_id;
  return jsonb_build_object('itemId',p_item_id,'state',p_next_state,'sequence',p_sequence,'replayed',false);
end;
$$;

create function private.reassign_batch_items(p_batch_id uuid,p_target_device_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_batch public.batches%rowtype;
  v_item public.batch_items%rowtype;
  v_count integer := 0;
  v_now timestamptz := now();
begin
  if v_owner is null then return jsonb_build_object('error','UNAUTHENTICATED'); end if;
  select b.* into v_batch from public.batches b where b.id=p_batch_id and b.owner_id=v_owner for update;
  if not found then return jsonb_build_object('error','BATCH_NOT_FOUND'); end if;
  perform 1 from public.devices d where d.id=p_target_device_id and d.owner_id=v_owner
    and d.revoked_at is null and d.last_seen_at>=v_now-interval '90 seconds' for share;
  if not found then return jsonb_build_object('error','TARGET_UNAVAILABLE'); end if;
  perform 1 from public.devices d where d.owner_id=v_owner and d.id in (
    select coalesce(i.assigned_device_id,v_batch.device_id) from public.batch_items i
    where i.batch_id=p_batch_id and i.owner_id=v_owner
      and i.status in ('pending','interrupted','failed','needs_attention','authenticating','transmitting','awaiting_result')
  ) for share;
  -- An expired lease is terminal before any explicit transfer; a live lease is never moved.
  update public.batch_items i
    set status='interrupted',lease_owner_device_id=null,lease_expires_at=null
    from public.devices d
    where i.batch_id=p_batch_id and i.owner_id=v_owner
      and d.id=coalesce(i.assigned_device_id,v_batch.device_id) and d.owner_id=v_owner
      and (d.revoked_at is not null or d.last_seen_at is null or d.last_seen_at<v_now-interval '90 seconds')
      and i.status in ('authenticating','transmitting','awaiting_result')
      and i.lease_expires_at<=v_now;
  if not exists (
    select 1 from public.batch_items i
    join public.devices d on d.id=coalesce(i.assigned_device_id,v_batch.device_id) and d.owner_id=v_owner
    where i.batch_id=p_batch_id and i.owner_id=v_owner
      and i.status in ('pending','interrupted','failed','needs_attention')
      and (i.lease_owner_device_id is null or i.lease_expires_at<=v_now)
      and d.id<>p_target_device_id and (d.revoked_at is not null or d.last_seen_at is null or d.last_seen_at<v_now-interval '90 seconds')
  ) then return jsonb_build_object('error','SOURCE_ONLINE'); end if;

  for v_item in select i.* from public.batch_items i
    join public.devices d on d.id=coalesce(i.assigned_device_id,v_batch.device_id) and d.owner_id=v_owner
    where i.batch_id=p_batch_id and i.owner_id=v_owner
    and i.status in ('pending','interrupted','failed','needs_attention')
    and (i.lease_owner_device_id is null or i.lease_expires_at<=v_now)
    and d.id<>p_target_device_id and (d.revoked_at is not null or d.last_seen_at is null or d.last_seen_at<v_now-interval '90 seconds')
    order by i.created_at,i.id for update of i
  loop
    update public.batch_items i set assigned_device_id=p_target_device_id,status='pending',
      lease_owner_device_id=null,lease_expires_at=null,last_event_sequence=i.last_event_sequence+1
      where i.id=v_item.id;
    insert into public.batch_item_events(batch_item_id,owner_id,device_id,sequence,expected_state,next_state,message,created_at,actor_user_id)
      values(v_item.id,v_owner,p_target_device_id,v_item.last_event_sequence+1,v_item.status,'pending',
        'Reatribuído pelo usuário '||v_owner::text||' ao dispositivo '||p_target_device_id::text,v_now,v_owner);
    v_count := v_count+1;
  end loop;
  return jsonb_build_object('reassignedCount',v_count);
end;
$$;
create function public.reassign_batch_items(p_batch_id uuid,p_target_device_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.reassign_batch_items(p_batch_id,p_target_device_id)
$$;
revoke all on function private.reassign_batch_items(uuid,uuid) from public, anon;
revoke all on function public.reassign_batch_items(uuid,uuid) from public, anon;
grant execute on function private.reassign_batch_items(uuid,uuid) to authenticated;
grant execute on function public.reassign_batch_items(uuid,uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='batch_items') then
    alter publication supabase_realtime add table public.batch_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='batch_item_events') then
    alter publication supabase_realtime add table public.batch_item_events;
  end if;
end $$;
