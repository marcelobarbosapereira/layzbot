begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

select has_column('public','devices','token_hash','devices store token hashes');
select has_table('public','device_enrollments','one-time enrollments exist');
select has_table('public','device_certificates','certificate metadata exists');
select has_function('public','create_device_enrollment',array['uuid','text','text','timestamptz'],'owner enrollment RPC exists');
select has_function('public','redeem_device_enrollment',array['uuid','text','uuid','text','text','text'],'agent enrollment RPC exists');
select has_function('public','record_device_heartbeat',array['uuid','text','text','text','jsonb','jsonb'],'heartbeat RPC exists');

insert into auth.users(id) values ('10000000-0000-4000-8000-000000000071'), ('10000000-0000-4000-8000-000000000072');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select is(public.create_device_enrollment('70000000-0000-4000-8000-000000000071','Executor fictício',repeat('a',64),now()+interval '10 minutes'),'70000000-0000-4000-8000-000000000071'::uuid,'owner creates enrollment');
select throws_ok($$select * from public.devices$$,'42501',null,'ordinary wildcard queries cannot expose token hashes');
select lives_ok($$select id,name,os,agent_version,last_seen_at,revoked_at,created_at from public.devices$$,'owner can query only sanitized device columns');
reset role;

select is((select id from public.redeem_device_enrollment('70000000-0000-4000-8000-000000000071',repeat('a',64),'60000000-0000-4000-8000-000000000071',repeat('b',64),'linux','1.0.0')),'60000000-0000-4000-8000-000000000071'::uuid,'enrollment creates the requested device identity');
select throws_ok($$select * from public.redeem_device_enrollment('70000000-0000-4000-8000-000000000071',repeat('a',64),'60000000-0000-4000-8000-000000000072',repeat('c',64),'linux','1.0.0')$$,'22023',null,'enrollment token is one-time');

insert into public.device_enrollments(id,owner_id,name,token_hash,created_at,expires_at) values ('70000000-0000-4000-8000-000000000072','10000000-0000-4000-8000-000000000071','Expirado',repeat('d',64),now()-interval '10 minutes',now()-interval '1 second');
select throws_ok($$select * from public.redeem_device_enrollment('70000000-0000-4000-8000-000000000072',repeat('d',64),'60000000-0000-4000-8000-000000000072',repeat('e',64),'linux','1.0.0')$$,'22023',null,'expired enrollment fails');

select lives_ok($$select * from public.record_device_heartbeat((select id from public.devices limit 1),repeat('b',64),'linux','1.0.1','["pgdas"]'::jsonb,'[{"fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","subject":"Responsável fictício","expiresAt":"2027-01-01T00:00:00Z","available":true}]'::jsonb)$$,'active device heartbeats');
select is((select agent_version from public.devices limit 1),'1.0.1','heartbeat updates version');
select is((select count(*) from public.device_certificates),1::bigint,'heartbeat stores certificate metadata only');
select is((select capabilities from public.devices limit 1),'["pgdas"]'::jsonb,'heartbeat stores capabilities');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select lives_ok($$select public.revoke_device((select id from public.devices limit 1))$$,'owner revokes own device');
reset role;
select throws_ok($$select * from public.record_device_heartbeat((select id from public.devices limit 1),repeat('b',64),'linux','1.0.2','[]'::jsonb,'[]'::jsonb)$$,'28000',null,'revoked device cannot heartbeat');
select is((select count(*) from public.devices where token_hash in (repeat('a',64),repeat('d',64))),0::bigint,'raw enrollment token hashes never become device token hashes');

select * from finish();
rollback;
