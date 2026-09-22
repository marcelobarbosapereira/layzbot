create table public.artifact_uploads (
  id uuid primary key default gen_random_uuid(),
  batch_item_id uuid not null,
  owner_id uuid not null references auth.users(id),
  device_id uuid not null,
  kind text not null check (kind in ('das','receipt')),
  object_path text not null check (split_part(object_path, '/', 1) = owner_id::text and object_path not like '%..%'),
  upload_token_hash text not null unique check (upload_token_hash ~ '^[a-f0-9]{64}$'),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  expected_byte_size bigint not null check (expected_byte_size between 0 and 9007199254740991),
  original_name text not null check (length(original_name) between 1 and 255),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (batch_item_id, owner_id) references public.batch_items(id, owner_id),
  foreign key (device_id, owner_id) references public.devices(id, owner_id)
);
create index artifact_uploads_expiry_idx on public.artifact_uploads(expires_at) where consumed_at is null;
alter table public.artifact_uploads enable row level security;
revoke all on public.artifact_uploads from anon, authenticated;

create function public.register_artifact_upload(
  p_device_id uuid, p_batch_item_id uuid, p_kind text, p_object_path text,
  p_upload_token_hash text, p_expected_sha256 text, p_expected_byte_size bigint, p_original_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_id uuid;
begin
  select d.owner_id into v_owner from public.devices d
    where d.id=p_device_id and d.revoked_at is null;
  if not found then raise exception 'Device unavailable' using errcode='28000'; end if;
  if not exists (select 1 from public.batch_items i where i.id=p_batch_item_id and i.owner_id=v_owner) then
    raise exception 'Batch item unavailable' using errcode='42501';
  end if;
  if p_kind not in ('das','receipt') or split_part(p_object_path,'/',1) <> v_owner::text
     or p_object_path like '%..%' or p_upload_token_hash !~ '^[a-f0-9]{64}$'
     or p_expected_sha256 !~ '^[a-f0-9]{64}$' or p_expected_byte_size < 0
     or p_original_name is null or length(p_original_name) not between 1 and 255 then
    raise exception 'Invalid artifact upload' using errcode='22023';
  end if;
  insert into public.artifact_uploads(batch_item_id,owner_id,device_id,kind,object_path,upload_token_hash,expected_sha256,expected_byte_size,original_name)
    values(p_batch_item_id,v_owner,p_device_id,p_kind,p_object_path,p_upload_token_hash,p_expected_sha256,p_expected_byte_size,p_original_name);
  select id into v_id from public.artifact_uploads where upload_token_hash=p_upload_token_hash;
  return jsonb_build_object('id', v_id);
exception when unique_violation then
  raise exception 'Upload token already registered' using errcode='23505';
end;
$$;

create function public.complete_artifact_upload(
  p_device_id uuid, p_upload_token_hash text, p_object_path text,
  p_sha256 text, p_byte_size bigint, p_original_name text
) returns public.artifacts language plpgsql security definer set search_path = '' as $$
declare v_upload public.artifact_uploads; v_artifact public.artifacts;
begin
  select u.* into v_upload from public.artifact_uploads u
    where u.device_id=p_device_id and u.upload_token_hash=p_upload_token_hash
      and u.object_path=p_object_path for update;
  if not found then raise exception 'Upload token invalid' using errcode='42501'; end if;
  if v_upload.consumed_at is not null or v_upload.expires_at <= now() then raise exception 'Upload token expired or consumed' using errcode='42501'; end if;
  if v_upload.expected_sha256 <> p_sha256 or v_upload.expected_byte_size <> p_byte_size or v_upload.original_name <> p_original_name then
    raise exception 'Artifact metadata mismatch' using errcode='22023';
  end if;
  insert into public.artifacts(batch_item_id,owner_id,kind,object_path,original_name,sha256,byte_size)
    values(v_upload.batch_item_id,v_upload.owner_id,v_upload.kind,v_upload.object_path,v_upload.original_name,p_sha256,p_byte_size)
    returning * into v_artifact;
  update public.artifact_uploads set consumed_at=now() where id=v_upload.id;
  return v_artifact;
end;
$$;
revoke all on function public.register_artifact_upload(uuid,uuid,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.complete_artifact_upload(uuid,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.register_artifact_upload(uuid,uuid,text,text,text,text,bigint,text) to service_role;
grant execute on function public.complete_artifact_upload(uuid,text,text,text,bigint,text) to service_role;
