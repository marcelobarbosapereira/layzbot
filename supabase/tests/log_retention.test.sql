begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);
select has_table('public', 'owner_log_settings', 'owners have retention settings');
select has_column('public', 'owner_log_settings', 'technical_log_retention_days', 'retention is configurable');
select has_table('public', 'technical_logs', 'technical logs are separate from fiscal audit events');
select has_function('public', 'cleanup_expired_technical_logs', array['uuid','timestamptz'], 'cleanup function exists');
select has_column('public', 'artifacts', 'kind', 'artifacts retain fiscal kinds');
select ok((select lower(pg_get_functiondef(p.oid)) like '%delete from public.technical_logs%'
  from pg_proc p where p.proname = 'cleanup_expired_technical_logs' limit 1), 'cleanup deletes expired technical logs');
select ok((select lower(pg_get_functiondef(p.oid)) like '%kind = ''error_screenshot''%'
  from pg_proc p where p.proname = 'cleanup_expired_technical_logs' limit 1), 'cleanup targets only sanitized error screenshots');
select ok((select lower(pg_get_functiondef(p.oid)) like '%das%'
  and lower(pg_get_functiondef(p.oid)) like '%receipt%'
  and lower(pg_get_functiondef(p.oid)) like '%fiscal evidence%'
  from pg_proc p where p.proname = 'cleanup_expired_technical_logs' limit 1), 'cleanup explicitly documents DAS and receipt preservation');
select ok((select lower(pg_get_functiondef(p.oid)) not like '%delete from public.batch_item_events%'
  from pg_proc p where p.proname = 'cleanup_expired_technical_logs' limit 1), 'cleanup does not delete append-only audit events');
select * from finish();
rollback;
