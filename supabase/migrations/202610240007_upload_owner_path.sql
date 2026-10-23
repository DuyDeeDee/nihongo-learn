-- Metadata must refer only to the owner's private Storage prefix.
alter table public.user_uploads add constraint user_uploads_owner_path
  check (bucket = 'user-content' and split_part(object_path, '/', 1) = user_id::text);
