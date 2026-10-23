-- Personal vocabulary is the source of flashcards. Keep prior review history when a word is removed.
create unique index if not exists flashcards_vocabulary_unique_idx
  on public.flashcards(vocabulary_id) where vocabulary_id is not null;

create or replace function public.sync_vocabulary_flashcard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.flashcards set suspended_at = now()
    where vocabulary_id = old.id and user_id = old.user_id;
    return old;
  end if;

  insert into public.flashcards
    (user_id, vocabulary_id, lesson_id, prompt_japanese, prompt_kana, accepted_answers, meaning)
  values
    (new.user_id, new.id, new.lesson_id, new.japanese, new.kana,
     case when new.kana is null or btrim(new.kana) = '' or new.kana = new.japanese
       then array[new.japanese] else array[new.japanese, new.kana] end,
     new.meaning)
  on conflict (vocabulary_id) where vocabulary_id is not null do update set
    lesson_id = excluded.lesson_id,
    prompt_japanese = excluded.prompt_japanese,
    prompt_kana = excluded.prompt_kana,
    accepted_answers = excluded.accepted_answers,
    meaning = excluded.meaning;
  return new;
end $$;

create trigger vocabulary_flashcard_sync
after insert or update of japanese, kana, meaning, lesson_id
on public.vocabulary_items for each row execute function public.sync_vocabulary_flashcard();
create trigger vocabulary_flashcard_suspend
before delete on public.vocabulary_items for each row execute function public.sync_vocabulary_flashcard();

insert into public.flashcards
  (user_id, vocabulary_id, lesson_id, prompt_japanese, prompt_kana, accepted_answers, meaning)
select v.user_id, v.id, v.lesson_id, v.japanese, v.kana,
  case when v.kana is null or btrim(v.kana) = '' or v.kana = v.japanese
    then array[v.japanese] else array[v.japanese, v.kana] end,
  v.meaning
from public.vocabulary_items v
on conflict (vocabulary_id) where vocabulary_id is not null do nothing;

-- Only one active Flashcard session per learner, including concurrent browser tabs.
create unique index if not exists study_sessions_one_active_flashcard_idx
  on public.study_sessions(user_id) where session_type = 'flashcard' and status = 'active';

alter table public.session_cards
  add column if not exists retry_answer text,
  add column if not exists retry_correct boolean,
  add column if not exists retry_completed_at timestamptz;

-- All grading and session writes go through the functions below.
revoke insert, update, delete on public.flashcards, public.study_sessions,
  public.session_cards, public.review_logs from public, anon, authenticated;

create or replace function public.start_flashcard_session(
  p_lesson_id uuid default null, p_answer_mode text default 'flexible'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_session uuid; v_count int;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_answer_mode is null or p_answer_mode not in ('kana', 'kanji', 'flexible') then raise exception 'Invalid answer mode'; end if;
  if p_lesson_id is not null and not exists (
    select 1 from public.lessons where id = p_lesson_id and is_active
  ) then raise exception 'Lesson not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select id into v_session from public.study_sessions
    where user_id = v_user and session_type = 'flashcard' and status = 'active'
    order by started_at desc limit 1;
  if v_session is not null then return v_session; end if;

  select count(*) into v_count from (
    select id from public.flashcards
    where user_id = v_user and (p_lesson_id is null or lesson_id = p_lesson_id)
      and suspended_at is null and due_at <= now()
      and (p_answer_mode <> 'kanji' or prompt_japanese ~ '[一-龯々]')
      and (p_answer_mode <> 'kana' or nullif(btrim(prompt_kana), '') is not null
           or prompt_japanese ~ '^[ぁ-ゖァ-ヶー]+$')
    limit 20
  ) due_cards;
  if v_count = 0 then return null; end if;

  insert into public.study_sessions(user_id, session_type, lesson_id, metadata)
    values(v_user, 'flashcard', p_lesson_id, jsonb_build_object('answer_mode', p_answer_mode))
    returning id into v_session;
  insert into public.session_cards(session_id, flashcard_id, position)
    select v_session, due_cards.id,
      (row_number() over (order by due_cards.due_at, due_cards.id) - 1)::int
    from (
      select id, due_at from public.flashcards
      where user_id = v_user and (p_lesson_id is null or lesson_id = p_lesson_id)
        and suspended_at is null and due_at <= now()
        and (p_answer_mode <> 'kanji' or prompt_japanese ~ '[一-龯々]')
        and (p_answer_mode <> 'kana' or nullif(btrim(prompt_kana), '') is not null
             or prompt_japanese ~ '^[ぁ-ゖァ-ヶー]+$')
      order by due_at, id limit 20
    ) due_cards;
  return v_session;
end $$;
revoke all on function public.start_flashcard_session(uuid,text) from public, anon;
grant execute on function public.start_flashcard_session(uuid,text) to authenticated;

-- The old RPC accepted arbitrary FSRS state and due dates from any signed-in client.
drop function if exists public.grade_session_card(uuid,text,text,boolean,int,real,timestamptz,jsonb);

create function public.grade_session_card_trusted(
  p_user_id uuid, p_session_card_id uuid, p_rating text, p_answer text,
  p_is_correct boolean, p_elapsed_ms int, p_scheduled_days real,
  p_expected_due_at timestamptz, p_expected_reps int,
  p_next_due_at timestamptz, p_fsrs_state jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sc record; v_log_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Server access required'; end if;
  if p_user_id is null or p_answer is null or btrim(p_answer) = '' then raise exception 'Invalid answer'; end if;
  if p_rating is null or p_rating not in ('again','hard','good','easy') or p_is_correct is null then raise exception 'Invalid rating'; end if;
  if (not p_is_correct and p_rating <> 'again') or (p_is_correct and p_rating = 'again')
    then raise exception 'Rating does not match recall result'; end if;
  if p_elapsed_ms is null or p_elapsed_ms < 0 or p_scheduled_days is null or p_scheduled_days < 0
     or p_next_due_at is null or p_expected_due_at is null or p_expected_reps is null
     or jsonb_typeof(p_fsrs_state) <> 'object'
    then raise exception 'Invalid scheduler result'; end if;

  select sc.id, sc.graded_once, sc.flashcard_id, s.user_id as session_user,
    s.status as session_status, f.user_id as card_user, f.due_at as old_due,
    f.reps as old_reps, f.suspended_at
  into v_sc from public.session_cards sc
    join public.study_sessions s on s.id = sc.session_id
    join public.flashcards f on f.id = sc.flashcard_id
    where sc.id = p_session_card_id for update of sc, f;
  if not found or v_sc.session_user <> p_user_id or v_sc.card_user <> p_user_id
    then raise exception 'Session card not found'; end if;
  select id into v_log_id from public.review_logs where session_card_id = p_session_card_id;
  if v_log_id is not null then return v_log_id; end if;
  if v_sc.session_status <> 'active' or v_sc.graded_once or v_sc.suspended_at is not null
    then raise exception 'Session card is unavailable'; end if;
  if v_sc.old_due <> p_expected_due_at or v_sc.old_reps <> p_expected_reps
    then raise exception 'Card state changed; refresh the session'; end if;

  update public.flashcards set fsrs_state = p_fsrs_state, due_at = p_next_due_at,
    stability = nullif(p_fsrs_state->>'stability','')::real,
    difficulty = nullif(p_fsrs_state->>'difficulty','')::real,
    last_review_at = now(), reps = reps + 1,
    lapses = lapses + case when p_rating = 'again' then 1 else 0 end,
    scheduler_version = 'fsrs-6'
  where id = v_sc.flashcard_id and user_id = p_user_id;
  insert into public.review_logs
    (user_id, flashcard_id, session_card_id, rating, answer, is_correct,
     elapsed_ms, scheduled_days, previous_due_at)
  values
    (p_user_id, v_sc.flashcard_id, p_session_card_id, p_rating, p_answer,
     p_is_correct, p_elapsed_ms, p_scheduled_days, v_sc.old_due)
  returning id into v_log_id;
  update public.session_cards set typed_answer = p_answer, is_correct = p_is_correct,
    rating = p_rating, graded_once = true, srs_applied_at = now()
    where id = p_session_card_id;
  update public.study_sessions set cards_seen = cards_seen + 1,
    correct_count = correct_count + case when p_is_correct then 1 else 0 end
    where id = (select session_id from public.session_cards where id = p_session_card_id);
  return v_log_id;
end $$;
revoke all on function public.grade_session_card_trusted(uuid,uuid,text,text,boolean,int,real,timestamptz,int,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.grade_session_card_trusted(uuid,uuid,text,text,boolean,int,real,timestamptz,int,timestamptz,jsonb) to service_role;

create or replace function public.record_flashcard_retry(
  p_session_card_id uuid, p_answer text, p_is_correct boolean
) returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or p_answer is null or btrim(p_answer) = '' or p_is_correct is null
    then raise exception 'Invalid retry'; end if;
  update public.session_cards sc set retry_answer = p_answer,
    retry_correct = p_is_correct, retry_completed_at = case when p_is_correct then now() else null end,
    attempt_index = attempt_index + 1
  from public.study_sessions s where sc.id = p_session_card_id and sc.session_id = s.id
    and s.user_id = v_user and s.status = 'active'
    and sc.graded_once and sc.is_correct = false and sc.retry_completed_at is null;
  if not found then raise exception 'Retry is unavailable'; end if;
end $$;
revoke all on function public.record_flashcard_retry(uuid,text,boolean) from public, anon;
grant execute on function public.record_flashcard_retry(uuid,text,boolean) to authenticated;

create or replace function public.finish_flashcard_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.session_cards sc where sc.session_id = p_session_id
      and (not sc.graded_once or (sc.is_correct = false and sc.retry_completed_at is null))
  ) then raise exception 'Session has unfinished cards'; end if;
  update public.study_sessions set status = 'completed', ended_at = now()
    where id = p_session_id and user_id = v_user and session_type = 'flashcard' and status = 'active';
  if not found then raise exception 'Session not found'; end if;
end $$;
revoke all on function public.finish_flashcard_session(uuid) from public, anon;
grant execute on function public.finish_flashcard_session(uuid) to authenticated;
