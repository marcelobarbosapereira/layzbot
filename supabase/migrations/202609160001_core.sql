create type public.document_type as enum ('cpf', 'cnpj');
create type public.obligation_type as enum ('inss', 'fgts', 'gps', 'esocial', 'simples', 'dctf_web');
create type public.simple_activity as enum ('commerce', 'services');

create table public.responsibles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(btrim(name)) >= 2),
  document text not null check (document ~ '^([0-9]{11}|[0-9]{14})$'),
  document_type public.document_type generated always as
    (case when length(document) = 11 then 'cpf'::public.document_type else 'cnpj'::public.document_type end) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.taxpayers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  responsible_id uuid not null,
  name text not null check (length(btrim(name)) >= 2),
  document text not null check (document ~ '^([0-9]{11}|[0-9]{14})$'),
  document_type public.document_type generated always as
    (case when length(document) = 11 then 'cpf'::public.document_type else 'cnpj'::public.document_type end) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (responsible_id, owner_id) references public.responsibles(id, owner_id)
);
create unique index taxpayers_owner_document_key on public.taxpayers(owner_id, document);
create index taxpayers_responsible_idx on public.taxpayers(responsible_id, owner_id);

create table public.taxpayer_obligations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  taxpayer_id uuid not null,
  obligation public.obligation_type not null,
  active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (taxpayer_id, obligation),
  foreign key (taxpayer_id, owner_id) references public.taxpayers(id, owner_id)
);

create table public.simple_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  taxpayer_id uuid not null unique,
  activity public.simple_activity not null,
  tax_option text not null check (length(btrim(tax_option)) > 0),
  municipality_code text,
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (taxpayer_id, owner_id) references public.taxpayers(id, owner_id)
);

create table public.monthly_assessments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  taxpayer_id uuid not null,
  obligation public.obligation_type not null,
  competence text not null check (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revenue_cents bigint not null default 0 check (revenue_cents >= 0),
  selected boolean not null default false,
  status text not null default 'pending',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (taxpayer_id, owner_id) references public.taxpayers(id, owner_id)
);
create unique index monthly_assessments_unique_period
  on public.monthly_assessments(taxpayer_id, obligation, competence);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger responsibles_updated_at before update on public.responsibles
  for each row execute function public.set_updated_at();
create trigger taxpayers_updated_at before update on public.taxpayers
  for each row execute function public.set_updated_at();
create trigger taxpayer_obligations_updated_at before update on public.taxpayer_obligations
  for each row execute function public.set_updated_at();
create trigger simple_profiles_updated_at before update on public.simple_profiles
  for each row execute function public.set_updated_at();
create trigger monthly_assessments_updated_at before update on public.monthly_assessments
  for each row execute function public.set_updated_at();

alter table public.responsibles enable row level security;
alter table public.taxpayers enable row level security;
alter table public.taxpayer_obligations enable row level security;
alter table public.simple_profiles enable row level security;
alter table public.monthly_assessments enable row level security;

create policy "owners manage responsibles" on public.responsibles
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "owners manage taxpayers" on public.taxpayers
for all to authenticated
using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.responsibles r
    where r.id = responsible_id and r.owner_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.responsibles r
    where r.id = responsible_id and r.owner_id = (select auth.uid())
  )
);

create policy "owners manage obligations" on public.taxpayer_obligations
for all to authenticated
using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.taxpayers t
    where t.id = taxpayer_id and t.owner_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.taxpayers t
    where t.id = taxpayer_id and t.owner_id = (select auth.uid())
  )
);

create policy "owners manage profiles" on public.simple_profiles
for all to authenticated
using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.taxpayers t
    where t.id = taxpayer_id and t.owner_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.taxpayers t
    where t.id = taxpayer_id and t.owner_id = (select auth.uid())
  )
);

create policy "owners manage assessments" on public.monthly_assessments
for all to authenticated
using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.taxpayers t
    where t.id = taxpayer_id and t.owner_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.taxpayers t
    where t.id = taxpayer_id and t.owner_id = (select auth.uid())
  )
);

-- Anonymous reads return no rows under RLS. Only authenticated owners can mutate.
revoke all on public.responsibles, public.taxpayers, public.taxpayer_obligations,
  public.simple_profiles, public.monthly_assessments from anon, authenticated;
grant select on public.responsibles, public.taxpayers, public.taxpayer_obligations,
  public.simple_profiles, public.monthly_assessments to anon;
grant select, insert, update, delete on public.responsibles, public.taxpayers,
  public.taxpayer_obligations, public.simple_profiles, public.monthly_assessments to authenticated;
