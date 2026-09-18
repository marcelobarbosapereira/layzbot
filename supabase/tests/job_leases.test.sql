begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(29);

select has_column('public','batch_items','lease_owner_device_id','items identify the lease owner');
select has_column('public','batch_items','lease_expires_at','items record lease expiry');
select has_column('public','batch_items','last_event_sequence','items record the last accepted sequence');
select has_table('public','batch_item_events','append-only job events exist');
select has_function('public','claim_next_batch_item',array['uuid','text'],'claim RPC exists');
select has_function('public','append_batch_item_event',array['uuid','uuid','text','text','text','text','bigint'],'event RPC exists');

-- Fabricated identities and snapshots only; the outer transaction rolls everything back.
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000081'),
  ('10000000-0000-4000-8000-000000000082');
insert into public.responsibles(id,owner_id,name,document) values
  ('20000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','Responsável fictício','31415926000188');
insert into public.taxpayers(id,owner_id,responsible_id,name,document) values
  ('30000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','20000000-0000-4000-8000-000000000081','Empresa fictícia A','16180339000147'),
  ('30000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000081','20000000-0000-4000-8000-000000000081','Empresa fictícia B','27182818000129');
insert into public.monthly_assessments(id,owner_id,taxpayer_id,obligation,competence,revenue_cents) values
  ('40000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','30000000-0000-4000-8000-000000000081','simples','2026-09',12345),
  ('40000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000081','30000000-0000-4000-8000-000000000082','simples','2026-09',67890);
insert into public.devices(id,owner_id,name,token_hash,last_seen_at) values
  ('60000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','Executor A',repeat('a',64),now()),
  ('60000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000081','Executor B',repeat('b',64),now()),
  ('60000000-0000-4000-8000-000000000083','10000000-0000-4000-8000-000000000082','Executor externo',repeat('c',64),now());
insert into public.batches(id,owner_id,device_id,competence,item_count,total_revenue_cents) values
  ('70000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081','2026-09',2,80235);
insert into public.batch_items(id,batch_id,owner_id,assessment_id,competence,revenue_cents,activity,tax_option,parameters,taxpayer_id,taxpayer_name,taxpayer_document,responsible_id,responsible_name,responsible_document,status) values
  ('80000000-0000-4000-8000-000000000081','70000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','40000000-0000-4000-8000-000000000081','2026-09',12345,'commerce','Varejo','{}','30000000-0000-4000-8000-000000000081','Empresa fictícia','16180339000147','20000000-0000-4000-8000-000000000081','Responsável fictício','31415926000188','pending'),
  ('80000000-0000-4000-8000-000000000082','70000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','40000000-0000-4000-8000-000000000082','2026-09',67890,'commerce','Varejo','{}','30000000-0000-4000-8000-000000000082','Empresa fictícia B','27182818000129','20000000-0000-4000-8000-000000000081','Responsável fictício','31415926000188','queued');

select set_config('test.claim',coalesce(public.claim_next_batch_item('60000000-0000-4000-8000-000000000081',repeat('a',64))::text,'null'),true);
select is(current_setting('test.claim')::jsonb->>'itemId','80000000-0000-4000-8000-000000000081','assigned device claims the oldest item');
select is(current_setting('test.claim')::jsonb->>'state','authenticating','claim enters authenticating state atomically');
select is((select lease_owner_device_id from public.batch_items where id='80000000-0000-4000-8000-000000000081'),'60000000-0000-4000-8000-000000000081'::uuid,'claim records lease owner');
select ok((select lease_expires_at > now() from public.batch_items where id='80000000-0000-4000-8000-000000000081'),'claim records a future lease expiry');
select is(public.claim_next_batch_item('60000000-0000-4000-8000-000000000081',repeat('a',64)),null::jsonb,'a second contender cannot claim the same pending item');
select is(public.claim_next_batch_item('60000000-0000-4000-8000-000000000082',repeat('b',64)),null::jsonb,'concurrent contender assigned to another device cannot claim the item');
select is(public.claim_next_batch_item('60000000-0000-4000-8000-000000000083',repeat('c',64)),null::jsonb,'foreign-owner device cannot claim the item');
select is((select count(*) from public.batch_items where status='authenticating'),1::bigint,'exactly one claim succeeds under contention');

select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'authenticating','transmitting',E'  Abrindo\u0007 portal  ',1)->>'state','transmitting','owner advances through a valid transition');
select is((select message from public.batch_item_events where batch_item_id='80000000-0000-4000-8000-000000000081' and sequence=1),'Abrindo portal','event message is sanitized before storage');
select ok((select lease_expires_at > now() from public.batch_items where id='80000000-0000-4000-8000-000000000081'),'event renews the live lease');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000082',repeat('b',64),'transmitting','awaiting_result','Tentativa indevida',2)->>'error','LEASE_LOST','non-owner device cannot publish an event');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'authenticating','transmitting','Estado obsoleto',2)->>'error','INVALID_TRANSITION','expected current state is enforced');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'transmitting','authenticating','Retrocesso',2)->>'error','INVALID_TRANSITION','backward transition is rejected');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'authenticating','transmitting',E'  Abrindo\u0007 portal  ',1)->>'sequence','1','identical duplicate sequence is idempotent');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'authenticating','transmitting','Conteúdo diferente',1)->>'error','DUPLICATE_SEQUENCE','duplicate sequence with different content is rejected');
select is((select count(*) from public.batch_item_events where batch_item_id='80000000-0000-4000-8000-000000000081'),1::bigint,'idempotent replay does not append a second event');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'transmitting','awaiting_result','Pulou sequência',3)->>'error','INVALID_SEQUENCE','sequence gaps are rejected');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'transmitting','awaiting_result','Transmitido',2)->>'state','awaiting_result','forward transition is accepted');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000081',repeat('a',64),'awaiting_result','completed','DAS emitido',3)->>'state','completed','terminal completion is accepted');

update public.batch_items set status='pending' where id='80000000-0000-4000-8000-000000000082';
select set_config('test.expiring_claim',coalesce(public.claim_next_batch_item('60000000-0000-4000-8000-000000000081',repeat('a',64))::text,'null'),true);
update public.batch_items set lease_expires_at=now()-interval '1 second' where id='80000000-0000-4000-8000-000000000082';
select is(public.claim_next_batch_item('60000000-0000-4000-8000-000000000081',repeat('a',64)),null::jsonb,'expired item is not silently reassigned');
select is((select status from public.batch_items where id='80000000-0000-4000-8000-000000000082'),'interrupted','expired lease becomes interrupted');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000082','60000000-0000-4000-8000-000000000081',repeat('a',64),'authenticating','transmitting','Chegou tarde',1)->>'error','LEASE_LOST','expired owner receives stable lease-lost result');

select * from finish();
rollback;
