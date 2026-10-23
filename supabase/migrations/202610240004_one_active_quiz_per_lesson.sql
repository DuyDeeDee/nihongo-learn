-- Two browser tabs should resume the same active Quiz for one learner and lesson.
create unique index if not exists study_sessions_one_active_quiz_lesson_idx
  on public.study_sessions (user_id, lesson_id)
  where session_type = 'quiz' and status = 'active';
