-- Retry correctness is checked by the Next.js server, not accepted from a browser RPC call.
drop function if exists public.record_flashcard_retry(uuid,text,boolean);

create function public.record_flashcard_retry_trusted(
  p_user_id uuid, p_session_card_id uuid, p_answer text, p_is_correct boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Server access required'; end if;
  if p_user_id is null or p_answer is null or btrim(p_answer) = '' or p_is_correct is null
    then raise exception 'Invalid retry'; end if;
  update public.session_cards sc set retry_answer = p_answer,
    retry_correct = p_is_correct,
    retry_completed_at = case when p_is_correct then now() else null end,
    attempt_index = attempt_index + 1
  from public.study_sessions s where sc.id = p_session_card_id and sc.session_id = s.id
    and s.user_id = p_user_id and s.status = 'active'
    and sc.graded_once and sc.is_correct = false and sc.retry_completed_at is null;
  if not found then raise exception 'Retry is unavailable'; end if;
end $$;
revoke all on function public.record_flashcard_retry_trusted(uuid,uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.record_flashcard_retry_trusted(uuid,uuid,text,boolean)
  to service_role;
