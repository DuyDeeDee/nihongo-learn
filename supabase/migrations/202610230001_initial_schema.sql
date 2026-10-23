-- Nihongo Quest initial schema. Catalog seed contains metadata only.
create extension if not exists pgcrypto;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check (char_length(display_name) <= 100), avatar_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'name','')) on conflict(id) do nothing;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.textbook_editions (
 id uuid primary key default gen_random_uuid(), slug text not null unique,
 title text not null, publisher_label text, language_pair text not null default 'ja-vi',
 is_active boolean not null default true, sort_order int not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now()
);
create table public.textbook_volumes (
 id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.textbook_editions on delete restrict,
 volume_number smallint not null check(volume_number between 1 and 10), title text not null,
 sort_order int not null default 0 check(sort_order>=0), unique(edition_id,volume_number)
);
create table public.lessons (
 id uuid primary key default gen_random_uuid(), volume_id uuid not null references public.textbook_volumes on delete restrict,
 lesson_number smallint not null check(lesson_number between 1 and 50), title text not null,
 sort_order int not null check(sort_order>=0), is_active boolean not null default true,
 unique(volume_id,lesson_number), unique(volume_id,sort_order)
);
create table public.user_preferences (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
 edition_id uuid references public.textbook_editions(id) on delete set null,
 volume_id uuid references public.textbook_volumes(id) on delete set null,
 daily_goal smallint not null default 20 check(daily_goal between 1 and 200),
 review_reset_hour smallint not null default 4 check(review_reset_hour between 0 and 23),
 timezone text not null default 'Asia/Ho_Chi_Minh', answer_mode text not null default 'flexible' check(answer_mode in ('kana','kanji','flexible')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_lesson_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 status text not null default 'not_started' check(status in ('not_started','in_progress','completed')),
 vocabulary_done int not null default 0 check(vocabulary_done>=0), grammar_done int not null default 0 check(grammar_done>=0),
 quiz_best_score numeric(5,2) check(quiz_best_score between 0 and 100), completed_at timestamptz,
 updated_at timestamptz not null default now(), unique(user_id,lesson_id)
);
create table public.vocabulary_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 japanese text not null check(char_length(japanese) between 1 and 500), kana text check(char_length(kana)<=500),
 meaning text not null check(char_length(meaning) between 1 and 2000), part_of_speech text,
 example_japanese text check(char_length(example_japanese)<=2000), example_meaning text check(char_length(example_meaning)<=2000),
 source_note text check(char_length(source_note)<=1000), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.grammar_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 pattern text not null check(char_length(pattern) between 1 and 500), explanation text not null check(char_length(explanation)<=4000),
 example_japanese text check(char_length(example_japanese)<=2000), example_meaning text check(char_length(example_meaning)<=2000),
 source_note text check(char_length(source_note)<=1000), sort_order int not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.flashcards (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 vocabulary_id uuid references public.vocabulary_items(id) on delete set null,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 prompt_japanese text not null check(char_length(prompt_japanese) between 1 and 500), prompt_kana text,
 accepted_answers text[] not null default '{}', meaning text not null check(char_length(meaning)<=2000),
 mode text not null default 'flexible' check(mode in ('kana','kanji','flexible')),
 fsrs_state jsonb not null default '{}', scheduler_version text not null default 'fsrs-6', due_at timestamptz not null default now(),
 stability real, difficulty real, last_review_at timestamptz, reps int not null default 0 check(reps>=0),
 lapses int not null default 0 check(lapses>=0), suspended_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.study_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 session_type text not null check(session_type in ('flashcard','quiz','review','game')),
 lesson_id uuid references public.lessons(id) on delete set null,
 status text not null default 'active' check(status in ('active','completed','abandoned')),
 started_at timestamptz not null default now(), ended_at timestamptz,
 cards_seen int not null default 0 check(cards_seen>=0), correct_count int not null default 0 check(correct_count>=0),
 metadata jsonb not null default '{}'
);
create table public.session_cards (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.study_sessions(id) on delete cascade,
 flashcard_id uuid not null references public.flashcards(id) on delete cascade,
 position int not null check(position>=0), attempt_index int not null default 1 check(attempt_index>=1),
 typed_answer text, is_correct boolean, rating text check(rating in ('again','hard','good','easy')),
 graded_once boolean not null default false, srs_applied_at timestamptz, created_at timestamptz not null default now(),
 unique(session_id,flashcard_id)
);
create table public.review_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 flashcard_id uuid not null references public.flashcards(id) on delete cascade,
 session_card_id uuid not null unique references public.session_cards(id) on delete cascade,
 rating text not null check(rating in ('again','hard','good','easy')), answer text,
 is_correct boolean not null, elapsed_ms int check(elapsed_ms>=0), scheduled_days real check(scheduled_days>=0),
 previous_due_at timestamptz, reviewed_at timestamptz not null default now()
);
create table public.quiz_questions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 prompt text not null check(char_length(prompt) between 1 and 2000),
 question_type text not null check(question_type in ('multiple_choice','typed','ordering','particle')),
 options jsonb not null default '[]', accepted_answers text[] not null default '{}',
 explanation text, difficulty smallint check(difficulty between 1 and 5), created_at timestamptz not null default now()
);
create table public.quiz_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null references public.study_sessions(id) on delete cascade,
 question_id uuid not null references public.quiz_questions(id) on delete cascade,
 answer jsonb not null default 'null', is_correct boolean not null, elapsed_ms int check(elapsed_ms>=0), attempted_at timestamptz not null default now()
);
create table public.game_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid references public.study_sessions(id) on delete set null,
 game_type text not null check(game_type in ('sentence_builder','particle_master')),
 lesson_id uuid references public.lessons(id) on delete set null, payload jsonb not null default '{}',
 is_correct boolean not null, score int not null default 0 check(score>=0), duration_ms int check(duration_ms>=0), created_at timestamptz not null default now()
);
create table public.achievements (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 achievement_key text not null, unlocked_at timestamptz not null default now(), metadata jsonb not null default '{}',
 unique(user_id,achievement_key)
);
create table public.user_uploads (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 bucket text not null default 'user-content', object_path text not null, media_type text not null,
 size_bytes bigint not null check(size_bytes>0), created_at timestamptz not null default now(), unique(bucket,object_path)
);

-- Updated-at maintenance.
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','user_preferences','user_lesson_progress','vocabulary_items','grammar_items','flashcards'] loop
 execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t);
end loop; end $$;

-- Indexes for catalog, owner dashboards and due reviews.
create index textbook_volumes_edition_sort_idx on public.textbook_volumes(edition_id,sort_order);
create index lessons_volume_sort_idx on public.lessons(volume_id,sort_order);
create index progress_user_status_idx on public.user_lesson_progress(user_id,status);
create index vocabulary_owner_lesson_idx on public.vocabulary_items(user_id,lesson_id);
create index grammar_owner_lesson_sort_idx on public.grammar_items(user_id,lesson_id,sort_order);
create index flashcards_due_idx on public.flashcards(user_id,due_at) where suspended_at is null;
create index flashcards_owner_lesson_idx on public.flashcards(user_id,lesson_id);
create index sessions_owner_started_idx on public.study_sessions(user_id,started_at desc);
create index session_cards_order_idx on public.session_cards(session_id,position);
create index review_logs_owner_date_idx on public.review_logs(user_id,reviewed_at desc);
create index review_logs_card_date_idx on public.review_logs(flashcard_id,reviewed_at desc);
create index quiz_attempts_owner_date_idx on public.quiz_attempts(user_id,attempted_at desc);
create index game_attempts_owner_date_idx on public.game_attempts(user_id,created_at desc);
create index uploads_owner_date_idx on public.user_uploads(user_id,created_at desc);

-- Owner RLS. Parent-session ownership is also verified by the session_cards policy.
alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select using(id=auth.uid());
create policy profiles_self_insert on public.profiles for insert with check(id=auth.uid());
create policy profiles_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
do $$ declare t text; begin foreach t in array array['user_preferences','user_lesson_progress','vocabulary_items','grammar_items','flashcards','study_sessions','quiz_questions','quiz_attempts','game_attempts','achievements','user_uploads'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy %I_owner_all on public.%I for all using(user_id=auth.uid()) with check(user_id=auth.uid())',t,t);
end loop; end $$;
alter table public.review_logs enable row level security;
create policy review_logs_owner_read on public.review_logs for select to authenticated using(user_id=auth.uid());
alter table public.session_cards enable row level security;
create policy session_cards_owner_all on public.session_cards for all
 using(exists(select 1 from public.study_sessions s where s.id=session_id and s.user_id=auth.uid()))
 with check(exists(select 1 from public.study_sessions s where s.id=session_id and s.user_id=auth.uid()) and exists(select 1 from public.flashcards f where f.id=flashcard_id and f.user_id=auth.uid()));
alter table public.textbook_editions enable row level security;
alter table public.textbook_volumes enable row level security;
alter table public.lessons enable row level security;
create policy editions_read_active on public.textbook_editions for select to authenticated using(is_active);
create policy volumes_read_authenticated on public.textbook_volumes for select to authenticated using(true);
create policy lessons_read_active on public.lessons for select to authenticated using(is_active);

-- Private storage bucket and owner-prefix rules.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('user-content','user-content',false,10485760,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy user_content_select on storage.objects for select to authenticated using(bucket_id='user-content' and (storage.foldername(name))[1]=auth.uid()::text);
create policy user_content_insert on storage.objects for insert to authenticated with check(bucket_id='user-content' and (storage.foldername(name))[1]=auth.uid()::text);
create policy user_content_update on storage.objects for update to authenticated using(bucket_id='user-content' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='user-content' and (storage.foldername(name))[1]=auth.uid()::text);
create policy user_content_delete on storage.objects for delete to authenticated using(bucket_id='user-content' and (storage.foldername(name))[1]=auth.uid()::text);

-- One atomic grade per session card. The application passes the FSRS-6 result from ts-fsrs.
create function public.grade_session_card(
 p_session_card_id uuid, p_rating text, p_answer text, p_is_correct boolean,
 p_elapsed_ms int, p_scheduled_days real, p_next_due_at timestamptz, p_fsrs_state jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_sc record; v_log_id uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_rating is null or p_is_correct is null or p_rating not in ('again','hard','good','easy') then raise exception 'Invalid rating'; end if;
 if (not p_is_correct and p_rating<>'again') or (p_is_correct and p_rating='again') then raise exception 'Rating does not match recall result'; end if;
 if p_elapsed_ms<0 or p_scheduled_days<0 or p_next_due_at is null or jsonb_typeof(p_fsrs_state)<>'object' then raise exception 'Invalid scheduler result'; end if;
 select sc.id,sc.flashcard_id,sc.graded_once,s.user_id as session_user,f.user_id as card_user,f.due_at as old_due
 into v_sc from public.session_cards sc join public.study_sessions s on s.id=sc.session_id
 join public.flashcards f on f.id=sc.flashcard_id where sc.id=p_session_card_id for update of sc,f;
 if not found or v_sc.session_user<>v_user or v_sc.card_user<>v_user then raise exception 'Session card not found'; end if;
 select id into v_log_id from public.review_logs where session_card_id=p_session_card_id;
 if v_log_id is not null then return v_log_id; end if;
 if v_sc.graded_once then raise exception 'Session card already graded'; end if;
 update public.flashcards set fsrs_state=p_fsrs_state,due_at=p_next_due_at,
  stability=nullif(p_fsrs_state->>'stability','')::real,difficulty=nullif(p_fsrs_state->>'difficulty','')::real,
  last_review_at=now(),reps=reps+1,lapses=lapses+case when p_rating='again' then 1 else 0 end,updated_at=now()
 where id=v_sc.flashcard_id and user_id=v_user;
 insert into public.review_logs(user_id,flashcard_id,session_card_id,rating,answer,is_correct,elapsed_ms,scheduled_days,previous_due_at)
 values(v_user,v_sc.flashcard_id,p_session_card_id,p_rating,p_answer,p_is_correct,p_elapsed_ms,p_scheduled_days,v_sc.old_due)
 returning id into v_log_id;
 update public.session_cards set typed_answer=p_answer,is_correct=p_is_correct,rating=p_rating,graded_once=true,srs_applied_at=now()
 where id=p_session_card_id;
 return v_log_id;
end $$;
revoke all on function public.grade_session_card(uuid,text,text,boolean,int,real,timestamptz,jsonb) from public,anon;
grant execute on function public.grade_session_card(uuid,text,text,boolean,int,real,timestamptz,jsonb) to authenticated;

-- Metadata only: no publisher lesson titles, vocabulary, examples, audio, or answers copied.
insert into public.textbook_editions(slug,title,publisher_label,sort_order)
values('minna-no-nihongo-shokyu-2e','Minna no Nihongo Shokyu · Edition 2','3A Corporation',1)
on conflict(slug) do nothing;
insert into public.textbook_volumes(edition_id,volume_number,title,sort_order)
select id,v,'Volume '||case when v=1 then 'I' else 'II' end, v from public.textbook_editions cross join generate_series(1,2) v
where slug='minna-no-nihongo-shokyu-2e' on conflict(edition_id,volume_number) do nothing;
insert into public.lessons(volume_id,lesson_number,title,sort_order)
select v.id,n,'Bài '||n,n from public.textbook_volumes v cross join generate_series(1,25) n
where (v.volume_number=1 and n<=25) or (v.volume_number=2 and n<=25)
on conflict(volume_id,lesson_number) do nothing;
-- This edition's 50 lesson slots are partitioned 1–25 and 26–50 across two volumes.
update public.lessons l set lesson_number=l.lesson_number+25, title='Bài '||(l.lesson_number+25)
from public.textbook_volumes v where l.volume_id=v.id and v.volume_number=2 and l.lesson_number between 1 and 25;
