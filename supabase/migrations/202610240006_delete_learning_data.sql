-- Remove one learner's application data in one database transaction. The auth
-- account and profile remain so the learner can start again after confirmation.
create function public.delete_my_learning_data()
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.game_attempts where user_id = v_user;
  delete from public.quiz_attempts where user_id = v_user;
  delete from public.review_logs where user_id = v_user;
  delete from public.session_cards sc using public.study_sessions s
    where sc.session_id = s.id and s.user_id = v_user;
  delete from public.study_sessions where user_id = v_user;
  delete from public.flashcards where user_id = v_user;
  delete from public.quiz_questions where user_id = v_user;
  delete from public.vocabulary_items where user_id = v_user;
  delete from public.grammar_items where user_id = v_user;
  delete from public.user_lesson_progress where user_id = v_user;
  delete from public.achievements where user_id = v_user;
  delete from public.user_uploads where user_id = v_user;
  delete from public.user_preferences where user_id = v_user;
end $$;

revoke all on function public.delete_my_learning_data() from public, anon;
grant execute on function public.delete_my_learning_data() to authenticated;
