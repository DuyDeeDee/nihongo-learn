import type {SupabaseClient} from "@supabase/supabase-js";
import type {AnswerMode} from "@/lib/answer";

export async function loadStudyCard(client: SupabaseClient, userId: string, sessionCardId: string) {
  const {data: sessionCard, error: sessionCardError} = await client.from("session_cards")
    .select("id,session_id,flashcard_id,graded_once,is_correct,retry_completed_at")
    .eq("id", sessionCardId).single();
  if (sessionCardError) throw sessionCardError;
  const {data: session, error: sessionError} = await client.from("study_sessions")
    .select("id,user_id,status,metadata").eq("id", sessionCard.session_id)
    .eq("user_id", userId).eq("session_type", "flashcard").single();
  if (sessionError) throw sessionError;
  const {data: flashcard, error: flashcardError} = await client.from("flashcards")
    .select("id,user_id,prompt_japanese,prompt_kana,accepted_answers,meaning,fsrs_state,due_at,reps,suspended_at")
    .eq("id", sessionCard.flashcard_id).eq("user_id", userId).single();
  if (flashcardError) throw flashcardError;
  const metadata = session.metadata as Record<string, unknown> | null;
  const modeValue = metadata?.answer_mode;
  const mode: AnswerMode = modeValue === "kana" || modeValue === "kanji" ? modeValue : "flexible";
  return {sessionCard, session, flashcard, mode};
}
