begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(40);

select has_table('public', 'responsibles', 'responsibles exists');
select has_table('public', 'taxpayers', 'taxpayers exists');
select has_table('public', 'taxpayer_obligations', 'taxpayer_obligations exists');
select has_table('public', 'simple_profiles', 'simple_profiles exists');
select has_table('public', 'monthly_assessments', 'monthly_assessments exists');
select is(
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace
    and relrowsecurity and relname in ('responsibles', 'taxpayers', 'taxpayer_obligations', 'simple_profiles', 'monthly_assessments')),
  5::bigint,
  'all exposed core tables enable RLS'
);

-- All identifiers and documents below are fabricated. The transaction rolls back.
insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.responsibles (id, owner_id, name, document) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Other responsible', '22222222222');
insert into public.taxpayers (id, owner_id, responsible_id, name, document) values
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Other taxpayer', '22222222222222');
insert into public.taxpayer_obligations (owner_id, taxpayer_id, obligation) values
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'simples');
insert into public.simple_profiles (owner_id, taxpayer_id, activity, tax_option) values
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'commerce', 'Test option');
insert into public.monthly_assessments (owner_id, taxpayer_id, obligation, competence) values
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'simples', '2026-09');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$insert into public.responsibles (id, owner_id, name, document) values ('20000000-0000-4000-8000-000000000001', auth.uid(), 'My responsible', '11111111111')$$, 'owner inserts responsible');
select lives_ok($$insert into public.taxpayers (id, owner_id, responsible_id, name, document) values ('30000000-0000-4000-8000-000000000001', auth.uid(), '20000000-0000-4000-8000-000000000001', 'My taxpayer', '11111111111111')$$, 'owner inserts taxpayer');
select lives_ok($$insert into public.taxpayer_obligations (owner_id, taxpayer_id, obligation) values (auth.uid(), '30000000-0000-4000-8000-000000000001', 'simples')$$, 'owner inserts obligation');
select lives_ok($$insert into public.simple_profiles (owner_id, taxpayer_id, activity, tax_option) values (auth.uid(), '30000000-0000-4000-8000-000000000001', 'services', 'Test option')$$, 'owner inserts profile');
select lives_ok($$insert into public.monthly_assessments (owner_id, taxpayer_id, obligation, competence) values (auth.uid(), '30000000-0000-4000-8000-000000000001', 'simples', '2026-09')$$, 'owner inserts assessment');

select is((select count(*) from public.responsibles), 1::bigint, 'owner sees only own responsible');
select is((select count(*) from public.taxpayers), 1::bigint, 'owner sees only own taxpayer');
select is((select count(*) from public.taxpayer_obligations), 1::bigint, 'owner sees only own obligation');
select is((select count(*) from public.simple_profiles), 1::bigint, 'owner sees only own profile');
select is((select count(*) from public.monthly_assessments), 1::bigint, 'owner sees only own assessment');

select throws_ok($$insert into public.responsibles (owner_id, name, document) values ('10000000-0000-4000-8000-000000000002', 'Spoofed owner', '33333333333')$$, '42501', null, 'cannot spoof responsible owner');
select throws_ok($$insert into public.taxpayers (owner_id, responsible_id, name, document) values (auth.uid(), '20000000-0000-4000-8000-000000000002', 'Foreign responsible', '33333333333')$$, '42501', null, 'taxpayer checks responsible ownership');
select throws_ok($$insert into public.taxpayer_obligations (owner_id, taxpayer_id, obligation) values (auth.uid(), '30000000-0000-4000-8000-000000000002', 'inss')$$, '42501', null, 'obligation checks parent ownership');
select throws_ok($$insert into public.simple_profiles (owner_id, taxpayer_id, activity, tax_option) values (auth.uid(), '30000000-0000-4000-8000-000000000002', 'commerce', 'Test')$$, '42501', null, 'profile checks parent ownership');
select throws_ok($$insert into public.monthly_assessments (owner_id, taxpayer_id, obligation, competence) values (auth.uid(), '30000000-0000-4000-8000-000000000002', 'simples', '2026-10')$$, '42501', null, 'assessment checks parent ownership');

select throws_ok($$update public.taxpayers set responsible_id = '20000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot reparent taxpayer to foreign responsible');
select throws_ok($$update public.taxpayer_obligations set taxpayer_id = '30000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot reparent obligation to foreign taxpayer');
select throws_ok($$update public.simple_profiles set taxpayer_id = '30000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot reparent profile to foreign taxpayer');
select throws_ok($$update public.monthly_assessments set taxpayer_id = '30000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot reparent assessment to foreign taxpayer');
select throws_ok($$update public.taxpayer_obligations set owner_id = '10000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot spoof obligation owner');
select throws_ok($$update public.simple_profiles set owner_id = '10000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot spoof profile owner');
select throws_ok($$update public.monthly_assessments set owner_id = '10000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot spoof assessment owner');
select throws_ok($$update public.responsibles set owner_id = '10000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot transfer responsible ownership');
select throws_ok($$update public.taxpayers set owner_id = '10000000-0000-4000-8000-000000000002'$$, '42501', null, 'cannot transfer taxpayer ownership');

with changed as (update public.responsibles set name = 'Changed' where id = '20000000-0000-4000-8000-000000000002' returning id)
select is((select count(*) from changed), 0::bigint, 'cannot update another owner row');
with removed as (delete from public.responsibles where id = '20000000-0000-4000-8000-000000000002' returning id)
select is((select count(*) from removed), 0::bigint, 'cannot delete another owner row');
select throws_ok($$insert into public.taxpayers (owner_id, responsible_id, name, document) values (auth.uid(), '20000000-0000-4000-8000-000000000001', 'Duplicate', '11111111111111')$$, '23505', null, 'documents are unique per owner');
select throws_ok($$insert into public.monthly_assessments (owner_id, taxpayer_id, obligation, competence) values (auth.uid(), '30000000-0000-4000-8000-000000000001', 'simples', '2026-09')$$, '23505', null, 'assessment period is unique');
select is((select version from public.monthly_assessments), 1, 'assessment version starts at one');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is((select count(*) from public.responsibles), 0::bigint, 'anonymous cannot read responsibles');
select is((select count(*) from public.taxpayers), 0::bigint, 'anonymous cannot read taxpayers');
select is((select count(*) from public.taxpayer_obligations), 0::bigint, 'anonymous cannot read obligations');
select is((select count(*) from public.simple_profiles), 0::bigint, 'anonymous cannot read profiles');
select is((select count(*) from public.monthly_assessments), 0::bigint, 'anonymous cannot read assessments');

reset role;
select * from finish();
rollback;
