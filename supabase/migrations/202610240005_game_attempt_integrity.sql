-- The app server checks game answers and writes results with the service role.
drop policy if exists game_attempts_owner_all on public.game_attempts;
create policy game_attempts_owner_read on public.game_attempts
  for select to authenticated using (user_id = auth.uid());

-- Each completed one-question game session has one persisted result.
create unique index if not exists game_attempts_session_key
  on public.game_attempts (session_id) where session_id is not null;
