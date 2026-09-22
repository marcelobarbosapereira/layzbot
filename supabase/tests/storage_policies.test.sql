begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

select ok(
  exists(select 1 from storage.buckets where id = 'fiscal-documents'),
  'fiscal documents bucket exists'
);
select is(
  (select public from storage.buckets where id = 'fiscal-documents'),
  false,
  'fiscal documents bucket is private'
);

-- All identifiers and object names below are fabricated. The transaction rolls back.
select lives_ok(
  $$insert into storage.buckets (id, name, public) values ('storage-policy-test-other', 'storage-policy-test-other', false)$$,
  'creates a private control bucket for policy isolation'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('fiscal-documents', '10000000-0000-4000-8000-000000000001/existing.pdf')$$,
  'seeds an owner fiscal object'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('fiscal-documents', '10000000-0000-4000-8000-000000000002/foreign.pdf')$$,
  'seeds another owner fiscal object'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('storage-policy-test-other', '10000000-0000-4000-8000-000000000001/control.pdf')$$,
  'seeds an owner path in the control bucket'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from storage.objects),
  1::bigint,
  'owner reads only own objects from the fiscal bucket'
);
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and 'authenticated' = any(roles) and cmd <> 'SELECT'), 0::bigint, 'authenticated sessions cannot write storage directly');

reset role;
select * from finish();
rollback;
