-- Quiz results are graded by the Next.js server. Browser sessions may read their
-- own results but cannot choose is_correct or write another session's result.
drop policy if exists quiz_attempts_owner_all on public.quiz_attempts;
create policy quiz_attempts_owner_read on public.quiz_attempts
  for select to authenticated using (user_id = auth.uid());

-- A question receives one canonical answer per quiz session, including when the
-- browser retries the same request after a network failure.
create unique index if not exists quiz_attempts_session_question_key
  on public.quiz_attempts (session_id, question_id);
