begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(31);

select has_table('public', 'import_previews', 'import previews table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.import_previews'::regclass), 'import previews enables RLS');
select has_index('public', 'import_previews', 'import_previews_owner_expiry_idx', 'owner and expiry lookup is indexed');
select is(
  (select count(*) from pg_policy where polrelid = 'public.import_previews'::regclass),
  1::bigint,
  'import previews has one owner-scoped RLS policy'
);
select has_function('public', 'create_import_preview', array['text', 'jsonb'], 'preview creation RPC exists');
select has_function('public', 'commit_import', array['uuid'], 'commit RPC exists');
select ok(not has_table_privilege('authenticated', 'public.import_previews', 'SELECT'), 'authenticated cannot read preview rows directly');
select ok(not has_table_privilege('authenticated', 'public.import_previews', 'INSERT'), 'authenticated cannot write preview rows directly');
select ok(not has_table_privilege('anon', 'public.import_previews', 'SELECT'), 'anonymous cannot read preview rows directly');
select ok(not (select prosecdef from pg_proc where oid = 'public.commit_import(uuid)'::regprocedure), 'public commit wrapper is security invoker');
select ok((select prosecdef from pg_proc where oid = 'private.commit_import(uuid)'::regprocedure), 'private commit implementation is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.commit_import(uuid)'::regprocedure), 'private commit pins an empty search path');

-- All users, documents, and tokens below are fabricated. The transaction rolls back.
insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000012');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}', true);

select ok(
  public.create_import_preview(
    '2026-09',
    '[{"rowNumber":2,"sheet":"INSS","obligation":"inss","name":"Pessoa Fictícia Delta","document":"31415926590","responsibleName":"Escritório Fictício Delta","responsibleDocument":"99988877000108","configuration":{}}]'::jsonb
  ) is not null,
  'authenticated owner stores a validated preview through the RPC'
);
select throws_ok(
  $$select * from public.import_previews$$,
  '42501',
  null,
  'authenticated owner cannot bypass the preview RPC'
);

reset role;
insert into public.import_previews (token, owner_id, competence, valid_rows, expires_at, created_at) values
  (
    '40000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000011',
    '2026-09',
    '[
      {"rowNumber":2,"sheet":"Simples","obligation":"simples","name":"Empresa Fictícia Épsilon","document":"27182818000129","responsibleName":"Escritório Fictício Delta","responsibleDocument":"99988877000108","configuration":{},"activity":"commerce","taxOption":"Comércio varejista","revenueCents":1000000},
      {"rowNumber":2,"sheet":"DCTF Vazia","obligation":"dctf_web","name":"Empresa Fictícia Épsilon","document":"27182818000129","responsibleName":"Escritório Fictício Delta","responsibleDocument":"99988877000108","configuration":{}},
      {"rowNumber":2,"sheet":"INSS","obligation":"inss","name":"Pessoa Fictícia Zeta","document":"31415926590","responsibleName":"Escritório Fictício Delta","responsibleDocument":"99988877000108","configuration":{}},
      {"rowNumber":2,"sheet":"FGTS","obligation":"fgts","name":"Pessoa Fictícia Zeta","document":"31415926590","responsibleName":"Escritório Fictício Delta","responsibleDocument":"99988877000108","configuration":{}}
    ]'::jsonb,
    now() + interval '15 minutes',
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000011',
    '2026-09',
    '[{"rowNumber":2,"sheet":"INSS","obligation":"inss","name":"Pessoa Fictícia Eta","document":"27182818205","responsibleName":"Escritório Fictício Eta","responsibleDocument":"88877766000100","configuration":{}}]'::jsonb,
    now() + interval '15 minutes',
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000011',
    '2026-09',
    '[{"rowNumber":2,"sheet":"INSS","obligation":"inss","name":"Pessoa Fictícia Teta","document":"16180339887","responsibleName":"Escritório Fictício Teta","responsibleDocument":"77766655000100","configuration":{}}]'::jsonb,
    now() - interval '1 second',
    now() - interval '2 seconds'
  );

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select is(
  public.commit_import('40000000-0000-4000-8000-000000000011')->>'processedRows',
  '4',
  'commit processes every valid obligation row'
);
select is((select count(*) from public.responsibles), 1::bigint, 'commit deduplicates the responsible');
select is((select count(*) from public.taxpayers), 2::bigint, 'commit deduplicates normalized taxpayers');
select is((select count(*) from public.taxpayer_obligations), 4::bigint, 'commit preserves multiple obligations per taxpayer');
select is((select count(*) from public.simple_profiles), 1::bigint, 'commit creates the Simples profile');
select is((select count(*) from public.monthly_assessments), 1::bigint, 'commit creates one monthly assessment');
select is((select revenue_cents from public.monthly_assessments), 1000000::bigint, 'Simples Valor becomes exact revenue cents');

reset role;
select is(
  (select count(*) from public.import_previews where token = '40000000-0000-4000-8000-000000000011'),
  0::bigint,
  'successful commit consumes the preview token'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000012","role":"authenticated"}', true);
select throws_ok(
  $$select public.commit_import('40000000-0000-4000-8000-000000000012')$$,
  'P0001',
  'Import preview not found or expired',
  'another owner cannot commit the preview'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select throws_ok(
  $$select public.commit_import('40000000-0000-4000-8000-000000000013')$$,
  'P0001',
  'Import preview not found or expired',
  'expired preview cannot be committed'
);

reset role;
insert into public.import_previews (token, owner_id, competence, valid_rows, expires_at) values (
  '40000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000011',
  '2026-10',
  '[
    {"rowNumber":2,"sheet":"INSS","obligation":"inss","name":"Pessoa Fictícia Iota","document":"14142135623","responsibleName":"Escritório Fictício Iota","responsibleDocument":"66655544000100","configuration":{}},
    {"rowNumber":3,"sheet":"INSS","obligation":"invalid_child","name":"Pessoa Fictícia Capa","document":"17320508075","responsibleName":"Escritório Fictício Iota","responsibleDocument":"66655544000100","configuration":{}}
  ]'::jsonb,
  now() + interval '15 minutes'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select throws_ok(
  $$select public.commit_import('40000000-0000-4000-8000-000000000014')$$,
  '22P02',
  null,
  'an invalid child row aborts the commit'
);

reset role;
select is((select count(*) from public.responsibles where document = '66655544000100'), 0::bigint, 'rollback removes the responsible written before the invalid child');
select is((select count(*) from public.taxpayers where document in ('14142135623', '17320508075')), 0::bigint, 'rollback removes all taxpayers from the failed import');
select is((select count(*) from public.taxpayer_obligations o join public.taxpayers t on t.id = o.taxpayer_id where t.document in ('14142135623', '17320508075')), 0::bigint, 'rollback leaves no child obligations from the failed import');
select is((select count(*) from public.import_previews where token = '40000000-0000-4000-8000-000000000014'), 1::bigint, 'rollback preserves the preview for diagnosis');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.commit_import('40000000-0000-4000-8000-000000000012')$$,
  '42501',
  null,
  'anonymous cannot execute commit_import'
);
select throws_ok(
  $$select public.create_import_preview('2026-09', '[]'::jsonb)$$,
  '42501',
  null,
  'anonymous cannot execute create_import_preview'
);

reset role;
select * from finish();
rollback;
