insert into storage.buckets (id, name, public)
values ('fiscal-documents', 'fiscal-documents', false);

create policy "owners read fiscal objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners insert fiscal objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners update fiscal objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners delete fiscal objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
