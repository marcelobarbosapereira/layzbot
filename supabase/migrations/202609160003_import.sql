create schema if not exists private;

create unique index responsibles_owner_document_key
  on public.responsibles(owner_id, document);

create table public.import_previews (
  token uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  competence text not null check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  valid_rows jsonb not null check (
    jsonb_typeof(valid_rows) = 'array'
    and jsonb_array_length(valid_rows) > 0
  ),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index import_previews_owner_expiry_idx
  on public.import_previews(owner_id, expires_at);

alter table public.import_previews enable row level security;
create policy "owners access import previews" on public.import_previews
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
revoke all on public.import_previews from public, anon, authenticated;

create function private.create_import_preview(p_competence text, p_valid_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_token uuid;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_competence is null or p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid competence' using errcode = '22023';
  end if;

  if p_valid_rows is null
    or jsonb_typeof(p_valid_rows) <> 'array'
    or jsonb_array_length(p_valid_rows) = 0 then
    raise exception 'Preview has no valid rows' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_valid_rows) as candidate(row_data)
    where jsonb_typeof(candidate.row_data) <> 'object'
      or coalesce(candidate.row_data->>'name', '') = ''
      or coalesce(candidate.row_data->>'document', '') !~ '^([0-9]{11}|[0-9]{14})$'
      or coalesce(candidate.row_data->>'responsibleName', '') = ''
      or coalesce(candidate.row_data->>'responsibleDocument', '') !~ '^([0-9]{11}|[0-9]{14})$'
      or coalesce(candidate.row_data->>'obligation', '') = ''
  ) then
    raise exception 'Preview contains an invalid row' using errcode = '22023';
  end if;

  delete from public.import_previews
  where owner_id = v_owner and expires_at <= now();

  insert into public.import_previews (owner_id, competence, valid_rows)
  values (v_owner, p_competence, p_valid_rows)
  returning token into v_token;

  return v_token;
end;
$$;

create function private.commit_import(p_preview_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_preview public.import_previews%rowtype;
  v_row jsonb;
  v_responsible_id uuid;
  v_taxpayer_id uuid;
  v_obligation public.obligation_type;
  v_configuration jsonb;
  v_activity public.simple_activity;
  v_revenue_cents bigint;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select preview.*
  into v_preview
  from public.import_previews as preview
  where preview.token = p_preview_token
    and preview.owner_id = v_owner
    and preview.expires_at > now()
  for update;

  if not found then
    raise exception 'Import preview not found or expired' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(v_preview.valid_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
      or length(btrim(coalesce(v_row->>'name', ''))) < 2
      or coalesce(v_row->>'document', '') !~ '^([0-9]{11}|[0-9]{14})$'
      or length(btrim(coalesce(v_row->>'responsibleName', ''))) < 2
      or coalesce(v_row->>'responsibleDocument', '') !~ '^([0-9]{11}|[0-9]{14})$' then
      raise exception 'Import row is invalid' using errcode = '22023';
    end if;

    v_obligation := (v_row->>'obligation')::public.obligation_type;
    v_configuration := coalesce(v_row->'configuration', '{}'::jsonb);
    if jsonb_typeof(v_configuration) <> 'object' then
      raise exception 'Import row configuration must be an object' using errcode = '22023';
    end if;

    insert into public.responsibles (owner_id, name, document, active)
    values (
      v_owner,
      btrim(v_row->>'responsibleName'),
      v_row->>'responsibleDocument',
      true
    )
    on conflict (owner_id, document) do update
      set name = excluded.name,
          active = true
    returning id into v_responsible_id;

    insert into public.taxpayers (owner_id, responsible_id, name, document, active)
    values (
      v_owner,
      v_responsible_id,
      btrim(v_row->>'name'),
      v_row->>'document',
      true
    )
    on conflict (owner_id, document) do update
      set responsible_id = excluded.responsible_id,
          name = excluded.name,
          active = true
    returning id into v_taxpayer_id;

    insert into public.taxpayer_obligations (
      owner_id,
      taxpayer_id,
      obligation,
      active,
      configuration
    )
    values (
      v_owner,
      v_taxpayer_id,
      v_obligation,
      true,
      v_configuration
    )
    on conflict (taxpayer_id, obligation) do update
      set active = true,
          configuration = excluded.configuration;

    if v_obligation = 'simples'::public.obligation_type then
      v_activity := (v_row->>'activity')::public.simple_activity;
      if length(btrim(coalesce(v_row->>'taxOption', ''))) = 0
        or coalesce(v_row->>'revenueCents', '') !~ '^[0-9]+$' then
        raise exception 'Simples import row is invalid' using errcode = '22023';
      end if;
      v_revenue_cents := (v_row->>'revenueCents')::bigint;

      insert into public.simple_profiles (
        owner_id,
        taxpayer_id,
        activity,
        tax_option
      )
      values (
        v_owner,
        v_taxpayer_id,
        v_activity,
        btrim(v_row->>'taxOption')
      )
      on conflict (taxpayer_id) do update
        set activity = excluded.activity,
            tax_option = excluded.tax_option;

      insert into public.monthly_assessments as assessment (
        owner_id,
        taxpayer_id,
        obligation,
        competence,
        revenue_cents
      )
      values (
        v_owner,
        v_taxpayer_id,
        v_obligation,
        v_preview.competence,
        v_revenue_cents
      )
      on conflict (taxpayer_id, obligation, competence) do update
        set revenue_cents = excluded.revenue_cents,
            version = assessment.version + 1;
    end if;
  end loop;

  delete from public.import_previews
  where token = v_preview.token and owner_id = v_owner;

  return jsonb_build_object('processedRows', jsonb_array_length(v_preview.valid_rows));
end;
$$;

create function public.create_import_preview(p_competence text, p_valid_rows jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_import_preview(p_competence, p_valid_rows)
$$;

create function public.commit_import(p_preview_token uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.commit_import(p_preview_token)
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke execute on function private.create_import_preview(text, jsonb) from public, anon;
revoke execute on function private.commit_import(uuid) from public, anon;
grant execute on function private.create_import_preview(text, jsonb) to authenticated;
grant execute on function private.commit_import(uuid) to authenticated;

revoke execute on function public.create_import_preview(text, jsonb) from public, anon;
revoke execute on function public.commit_import(uuid) from public, anon;
grant execute on function public.create_import_preview(text, jsonb) to authenticated;
grant execute on function public.commit_import(uuid) to authenticated;
