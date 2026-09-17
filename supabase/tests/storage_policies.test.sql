begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);

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
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('fiscal-documents', '10000000-0000-4000-8000-000000000001/uploaded.pdf')$$,
  'owner inserts an object under own prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('fiscal-documents', '10000000-0000-4000-8000-000000000002/spoofed.pdf')$$,
  '42501',
  null,
  'owner cannot insert under another owner prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('storage-policy-test-other', '10000000-0000-4000-8000-000000000001/spoofed.pdf')$$,
  '42501',
  null,
  'owner cannot insert into another bucket'
);

with changed as (
  update storage.objects
  set name = '10000000-0000-4000-8000-000000000001/renamed.pdf'
  where name = '10000000-0000-4000-8000-000000000001/existing.pdf'
  returning id
)
select is((select count(*) from changed), 1::bigint, 'owner updates an object within own prefix');
select throws_ok(
  $$update storage.objects set name = '10000000-0000-4000-8000-000000000002/moved.pdf' where name = '10000000-0000-4000-8000-000000000001/renamed.pdf'$$,
  '42501',
  null,
  'owner cannot move an object to another owner prefix'
);
select throws_ok(
  $$update storage.objects set bucket_id = 'storage-policy-test-other' where name = '10000000-0000-4000-8000-000000000001/renamed.pdf'$$,
  '42501',
  null,
  'owner cannot move an object to another bucket'
);
with changed as (
  update storage.objects
  set metadata = '{"attempted":true}'::jsonb
  where name in (
    '10000000-0000-4000-8000-000000000002/foreign.pdf',
    '10000000-0000-4000-8000-000000000001/control.pdf'
  )
  returning id
)
select is((select count(*) from changed), 0::bigint, 'owner cannot update foreign-prefix or foreign-bucket objects');

reset role;
select * from finish();
rollback;
