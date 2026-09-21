begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

select has_column('public','batch_items','assigned_device_id','items have a device override');
select has_column('public','batch_item_events','batch_id','events can be filtered by batch');
select has_column('public','batch_item_events','actor_user_id','audit identifies the user');
select has_function('public','reassign_batch_items',array['uuid','uuid'],'owner reassignment RPC exists');

insert into auth.users(id) values ('10000000-0000-4000-8000-000000000091'),('10000000-0000-4000-8000-000000000092');
insert into public.responsibles(id,owner_id,name,document) values ('20000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091','Responsável fictício','31415926000188');
insert into public.taxpayers(id,owner_id,responsible_id,name,document)
select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000091','Empresa fictícia '||i, lpad(i::text,14,'0') from generate_series(1,4) i;
insert into public.monthly_assessments(id,owner_id,taxpayer_id,obligation,competence,revenue_cents)
select ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000091',('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'simples','2026-09',10000 from generate_series(1,4) i;
insert into public.devices(id,owner_id,name,token_hash,last_seen_at,revoked_at) values
('60000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091','Antigo',repeat('a',64),now(),null),
('60000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000091','Novo',repeat('b',64),now(),null),
('60000000-0000-4000-8000-000000000093','10000000-0000-4000-8000-000000000092','Outro',repeat('c',64),now(),null);
insert into public.batches(id,owner_id,device_id,competence,item_count,total_revenue_cents) values
('70000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091','60000000-0000-4000-8000-000000000091','2026-09',4,40000);
insert into public.batch_items(id,batch_id,owner_id,assessment_id,competence,revenue_cents,activity,tax_option,parameters,taxpayer_id,taxpayer_name,taxpayer_document,responsible_id,responsible_name,responsible_document,status)
select ('80000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'70000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091',('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'2026-09',10000,'commerce','Varejo','{}',('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Empresa fictícia '||i,lpad(i::text,14,'0'),'20000000-0000-4000-8000-000000000091','Responsável fictício','31415926000188',
case i when 1 then 'interrupted' when 2 then 'submitted' when 3 then 'das_downloaded' else 'completed' end from generate_series(1,4) i;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000092',true);
select is(public.reassign_batch_items('70000000-0000-4000-8000-000000000091','60000000-0000-4000-8000-000000000092')->>'error','BATCH_NOT_FOUND','foreign owner cannot reassign');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000091',true);
select is(public.reassign_batch_items('70000000-0000-4000-8000-000000000091','60000000-0000-4000-8000-000000000092')->>'error','SOURCE_ONLINE','online source blocks reassignment');
reset role;
update public.devices set revoked_at=now(),last_seen_at=now()-interval '10 minutes' where id='60000000-0000-4000-8000-000000000091';
set local role authenticated;
select is(public.reassign_batch_items('70000000-0000-4000-8000-000000000091','60000000-0000-4000-8000-000000000093')->>'error','TARGET_UNAVAILABLE','foreign target is rejected');
select is(public.reassign_batch_items('70000000-0000-4000-8000-000000000091','60000000-0000-4000-8000-000000000092')->>'reassignedCount','1','only interrupted item moves');
reset role;
select is((select assigned_device_id from public.batch_items where id='80000000-0000-4000-8000-000000000001'),'60000000-0000-4000-8000-000000000092'::uuid,'safe item assigned to new device');
select is((select status from public.batch_items where id='80000000-0000-4000-8000-000000000001'),'pending','safe item becomes claimable');
select is((select count(*) from public.batch_items where status in ('submitted','das_downloaded','completed') and assigned_device_id is null),3::bigint,'fiscal-effect states remain assigned to original device');
select is((select count(*) from public.batch_item_events where batch_id='70000000-0000-4000-8000-000000000091' and actor_user_id='10000000-0000-4000-8000-000000000091'),1::bigint,'reassignment writes user audit event with batch filter');
select ok((select created_at <= now() and message like 'Reatribuído%' from public.batch_item_events where actor_user_id='10000000-0000-4000-8000-000000000091'),'audit includes time and message');
select set_config('test.reassigned_claim',public.claim_next_batch_item('60000000-0000-4000-8000-000000000092',repeat('b',64))::text,true);
select is(current_setting('test.reassigned_claim')::jsonb->>'itemId','80000000-0000-4000-8000-000000000001','new device can claim reassigned item');
select is(current_setting('test.reassigned_claim')::jsonb->>'nextSequence','2','new agent receives the sequence after the audit event');
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000092',repeat('b',64),'authenticating','needs_attention','Procuração expirada',2)->>'state','needs_attention','agent can record an intervention');
update public.batch_items set status='awaiting_result',lease_owner_device_id='60000000-0000-4000-8000-000000000092',lease_expires_at=now()+interval '90 seconds' where id='80000000-0000-4000-8000-000000000002';
select is(public.append_batch_item_event('80000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000092',repeat('b',64),'awaiting_result','failed','Portal indisponível',1)->>'state','failed','agent can record a terminal failure');
select is(public.claim_next_batch_item('60000000-0000-4000-8000-000000000091',repeat('a',64))->>'error','DEVICE_REVOKED','revoked device cannot claim');
select is((select count(*) from public.batch_item_events where batch_id='70000000-0000-4000-8000-000000000091'),3::bigint,'agent events and audit have unique IDs');

select * from finish();
rollback;
