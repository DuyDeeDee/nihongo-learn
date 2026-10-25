-- Migration: Ensure general review strictly draws only from active lessons (in_progress or completed)
create or replace function public.start_flashcard_session(
  p_lesson_id uuid default null,
  p_answer_mode text default 'flexible'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_session uuid;
  v_count int;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_answer_mode is null or p_answer_mode not in ('kana', 'kanji', 'flexible') then
    raise exception 'Invalid answer mode';
  end if;
  if p_lesson_id is not null and not exists (
    select 1 from public.lessons where id = p_lesson_id and is_active
  ) then
    raise exception 'Lesson not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- If user requests a specific lesson:
  if p_lesson_id is not null then
    -- Check if an active session already exists for THIS specific lesson:
    select id into v_session from public.study_sessions
      where user_id = v_user and session_type = 'flashcard' and status = 'active'
        and lesson_id = p_lesson_id
      order by started_at desc limit 1;
    if v_session is not null then
      return v_session;
    end if;

    -- Automatically abandon any active session from another lesson or general review:
    update public.study_sessions
      set status = 'abandoned', ended_at = now()
      where user_id = v_user and session_type = 'flashcard' and status = 'active'
        and (lesson_id is null or lesson_id <> p_lesson_id);
  else
    -- General review (p_lesson_id is null):
    -- Check if an active general review session exists:
    select id into v_session from public.study_sessions
      where user_id = v_user and session_type = 'flashcard' and status = 'active'
        and lesson_id is null
      order by started_at desc limit 1;
    if v_session is not null then
      return v_session;
    end if;

    -- Automatically abandon any active specific lesson session:
    update public.study_sessions
      set status = 'abandoned', ended_at = now()
      where user_id = v_user and session_type = 'flashcard' and status = 'active';
  end if;

  -- Count eligible cards:
  select count(*) into v_count from (
    select id from public.flashcards
    where user_id = v_user
      and (
        (p_lesson_id is not null and lesson_id = p_lesson_id)
        or
        (p_lesson_id is null and lesson_id in (
          select lesson_id from public.user_lesson_progress
          where user_id = v_user and status in ('in_progress', 'completed')
        ))
      )
      and suspended_at is null and due_at <= now()
      and (p_answer_mode <> 'kanji' or prompt_japanese ~ '[一-龯々]')
      and (p_answer_mode <> 'kana' or nullif(btrim(prompt_kana), '') is not null
           or prompt_japanese ~ '^[ぁ-ゖァ-ヶー]+$')
    limit 20
  ) due_cards;

  if v_count = 0 then
    return null;
  end if;

  -- Create new session:
  insert into public.study_sessions(user_id, session_type, lesson_id, metadata)
    values(v_user, 'flashcard', p_lesson_id, jsonb_build_object('answer_mode', p_answer_mode))
    returning id into v_session;

  -- Insert cards shuffled randomly:
  insert into public.session_cards(session_id, flashcard_id, position)
    select v_session, due_cards.id,
      (row_number() over () - 1)::int
    from (
      select id from public.flashcards
      where user_id = v_user
        and (
          (p_lesson_id is not null and lesson_id = p_lesson_id)
          or
          (p_lesson_id is null and lesson_id in (
            select lesson_id from public.user_lesson_progress
            where user_id = v_user and status in ('in_progress', 'completed')
          ))
        )
        and suspended_at is null and due_at <= now()
        and (p_answer_mode <> 'kanji' or prompt_japanese ~ '[一-龯々]')
        and (p_answer_mode <> 'kana' or nullif(btrim(prompt_kana), '') is not null
             or prompt_japanese ~ '^[ぁ-ゖァ-ヶー]+$')
      order by random()
      limit 20
    ) due_cards;

  return v_session;
end $$;

revoke all on function public.start_flashcard_session(uuid, text) from public, anon;
grant execute on function public.start_flashcard_session(uuid, text) to authenticated;
