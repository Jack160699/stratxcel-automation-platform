-- Migration: Owner Operating Brain voice-note storage bucket.
-- Additive only. Same owner-folder-scoped RLS pattern as
-- social-agent-attachments (20260728151255_copilot_attachments_and_settings_fix.sql):
-- paths are always <owner_id>/<voice_note_id>.<ext>, and storage RLS checks
-- the first path segment against auth.uid() directly.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owner-voice-notes',
  'owner-voice-notes',
  false,
  26214400, -- 25MB — generous for a multi-minute voice note, small enough to keep cost-conscious
  array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy owner_voice_note_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'owner-voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid()))
  );

create policy owner_voice_note_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'owner-voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid()))
  );

create policy owner_voice_note_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'owner-voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid()))
  );
