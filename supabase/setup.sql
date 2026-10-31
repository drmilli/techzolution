-- Run once in the Supabase SQL Editor before seeding an uploader.
begin;
create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null check (category in ('interior', 'exterior', 'cabin', 'carwash', 'glass', 'mold', 'baseball', 'penthouse')),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (storage_path ~ ('^' || uploaded_by::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create index gallery_photos_created_idx on public.gallery_photos (created_at desc, id);
alter table public.gallery_photos enable row level security;
revoke all on public.gallery_photos from anon, authenticated;
grant select on public.gallery_photos to anon, authenticated;
grant insert on public.gallery_photos to authenticated;
create policy "Public can view gallery photos" on public.gallery_photos
  for select to anon, authenticated using (true);
create policy "Seeded uploaders can publish their photos" on public.gallery_photos
  for insert to authenticated with check (
    (select auth.jwt() -> 'app_metadata' ->> 'gallery_uploader') = 'true'
    and uploaded_by = (select auth.uid())
    and exists (select 1 from storage.objects where bucket_id = 'gallery' and name = storage_path)
  );
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']);
create policy "Seeded uploaders can upload gallery objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'gallery'
    and (select auth.jwt() -> 'app_metadata' ->> 'gallery_uploader') = 'true'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  );
-- Needed for the publication policy to verify an uploaded object exists.
create policy "Uploaders can inspect their gallery objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'gallery'
    and (select auth.jwt() -> 'app_metadata' ->> 'gallery_uploader') = 'true'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
commit;
