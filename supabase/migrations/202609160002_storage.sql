insert into storage.buckets (id, name, public)
values ('fiscal-documents', 'fiscal-documents', false);

create policy "owners read fiscal objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Writes are performed only by the server-side signed-upload/completion RPCs.
-- Authenticated browser sessions retain read-only access to their own objects.
