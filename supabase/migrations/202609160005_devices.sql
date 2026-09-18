-- Extend the minimal Task 6 device identity; do not replace it.
alter table public.devices
  add column token_hash text check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  add column os text check (os is null or length(btrim(os)) between 1 and 100),
  add column agent_version text check (agent_version is null or length(btrim(agent_version)) between 1 and 100),
  add column capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array');
create unique index devices_token_hash_idx on public.devices(token_hash) where token_hash is not null;

create table public.device_enrollments (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  name text not null check (length(btrim(name)) between 1 and 200),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index device_enrollments_owner_idx on public.device_enrollments(owner_id);
create unique index device_enrollments_token_hash_idx on public.device_enrollments(token_hash);

create table public.device_certificates (
  device_id uuid not null,
  owner_id uuid not null references auth.users(id),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  subject text not null check (length(btrim(subject)) between 1 and 500),
  expires_at timestamptz not null,
  available boolean not null,
  reported_at timestamptz not null default now(),
  primary key (device_id, fingerprint),
  foreign key (device_id, owner_id) references public.devices(id, owner_id) on delete cascade
);
create index device_certificates_owner_idx on public.device_certificates(owner_id);

alter table public.device_enrollments enable row level security;
alter table public.device_certificates enable row level security;
create policy "owners read device certificates" on public.device_certificates for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.device_enrollments, public.device_certificates from anon, authenticated;
-- Revoke the Task 6 table-wide SELECT before adding a secret column, then expose an explicit safe projection.
revoke select on public.devices from authenticated;
grant select (id, owner_id, name, os, agent_version, capabilities, last_seen_at, revoked_at, created_at) on public.devices to authenticated;
grant select (device_id, owner_id, fingerprint, subject, expires_at, available, reported_at) on public.device_certificates to authenticated;

create function private.create_device_enrollment(p_enrollment_id uuid, p_name text, p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200
    or p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() or p_expires_at > now() + interval '15 minutes'
  then raise exception 'Invalid enrollment' using errcode='22023'; end if;
  insert into public.device_enrollments(id,owner_id,name,token_hash,expires_at)
  values(p_enrollment_id,v_owner,btrim(p_name),p_token_hash,p_expires_at);
  return p_enrollment_id;
end;
$$;
create function public.create_device_enrollment(p_enrollment_id uuid, p_name text, p_token_hash text, p_expires_at timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_device_enrollment(p_enrollment_id,p_name,p_token_hash,p_expires_at)
$$;
revoke all on function private.create_device_enrollment(uuid,text,text,timestamptz) from public, anon;
revoke all on function public.create_device_enrollment(uuid,text,text,timestamptz) from public, anon;
grant execute on function private.create_device_enrollment(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.create_device_enrollment(uuid,text,text,timestamptz) to authenticated;

-- Public agent RPCs accept only peppered hashes computed by the Next.js server. Raw tokens never enter Postgres.
create function public.redeem_device_enrollment(p_enrollment_id uuid, p_enrollment_hash text, p_device_id uuid, p_device_hash text, p_os text, p_agent_version text)
returns table(id uuid, owner_id uuid, name text) language plpgsql security definer set search_path = '' as $$
declare v_enrollment public.device_enrollments%rowtype;
begin
  if p_enrollment_hash !~ '^[a-f0-9]{64}$' or p_device_hash !~ '^[a-f0-9]{64}$'
    or p_os is null or length(btrim(p_os)) not between 1 and 100
    or p_agent_version is null or length(btrim(p_agent_version)) not between 1 and 100
  then raise exception 'Invalid enrollment' using errcode='22023'; end if;
  select e.* into v_enrollment from public.device_enrollments e
    where e.id=p_enrollment_id and e.token_hash=p_enrollment_hash for update;
  if not found or v_enrollment.consumed_at is not null or v_enrollment.expires_at <= now()
  then raise exception 'Invalid or expired enrollment' using errcode='22023'; end if;
  update public.device_enrollments e set consumed_at=now() where e.id=v_enrollment.id;
  insert into public.devices(id,owner_id,name,token_hash,os,agent_version,last_seen_at)
    values(p_device_id,v_enrollment.owner_id,v_enrollment.name,p_device_hash,btrim(p_os),btrim(p_agent_version),now());
  return query select p_device_id,v_enrollment.owner_id,v_enrollment.name;
end;
$$;

create function public.get_device_auth_candidate(p_device_id uuid, p_token_hash text)
returns table(id uuid, owner_id uuid, name text, token_hash text, revoked_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select d.id,d.owner_id,d.name,d.token_hash,d.revoked_at from public.devices d
  where d.id=p_device_id and d.token_hash=p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$'
$$;

create function public.record_device_heartbeat(p_device_id uuid, p_token_hash text, p_os text, p_agent_version text, p_capabilities jsonb, p_certificates jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_seen timestamptz := now(); v_count integer;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_os is null or length(btrim(p_os)) not between 1 and 100
    or p_agent_version is null or length(btrim(p_agent_version)) not between 1 and 100
    or jsonb_typeof(p_capabilities) <> 'array' or jsonb_array_length(p_capabilities) > 100
    or jsonb_typeof(p_certificates) <> 'array' or jsonb_array_length(p_certificates) > 500
  then raise exception 'Invalid heartbeat' using errcode='22023'; end if;
  select d.owner_id into v_owner from public.devices d where d.id=p_device_id and d.token_hash=p_token_hash and d.revoked_at is null for update;
  if not found then raise exception 'Device unavailable' using errcode='28000'; end if;
  update public.devices d set os=btrim(p_os),agent_version=btrim(p_agent_version),capabilities=p_capabilities,last_seen_at=v_seen where d.id=p_device_id;
  delete from public.device_certificates c where c.device_id=p_device_id;
  insert into public.device_certificates(device_id,owner_id,fingerprint,subject,expires_at,available,reported_at)
  select p_device_id,v_owner,lower(x.fingerprint),btrim(x.subject),x."expiresAt",x.available,v_seen
  from jsonb_to_recordset(p_certificates) as x(fingerprint text,subject text,"expiresAt" timestamptz,available boolean)
  where x.fingerprint ~* '^[a-f0-9]{64}$' and length(btrim(x.subject)) between 1 and 500 and x."expiresAt" is not null;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_certificates) then raise exception 'Invalid certificate metadata' using errcode='22023'; end if;
  return jsonb_build_object('id',p_device_id,'online',true,'certificateCount',v_count,'lastSeenAt',v_seen);
end;
$$;

create function private.revoke_device(p_device_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.devices d set revoked_at=coalesce(d.revoked_at,now()) where d.id=p_device_id and d.owner_id=auth.uid();
  if not found then raise exception 'Device not found' using errcode='22023'; end if;
end;
$$;
create function public.revoke_device(p_device_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.revoke_device(p_device_id) $$;

revoke all on function public.redeem_device_enrollment(uuid,text,uuid,text,text,text) from public;
revoke all on function public.get_device_auth_candidate(uuid,text) from public;
revoke all on function public.record_device_heartbeat(uuid,text,text,text,jsonb,jsonb) from public;
revoke all on function private.revoke_device(uuid) from public, anon;
revoke all on function public.revoke_device(uuid) from public, anon;
grant execute on function public.redeem_device_enrollment(uuid,text,uuid,text,text,text) to anon, authenticated;
grant execute on function public.get_device_auth_candidate(uuid,text) to anon, authenticated;
grant execute on function public.record_device_heartbeat(uuid,text,text,text,jsonb,jsonb) to anon, authenticated;
grant execute on function private.revoke_device(uuid) to authenticated;
grant execute on function public.revoke_device(uuid) to authenticated;
