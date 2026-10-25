import {NextResponse} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {lessons} from "@/lib/data";
import {getAuthenticatedClient} from "@/lib/supabase-server";
import type {LiveCard, LiveSession, StudySnapshot} from "@/lib/study-types";
import type {AnswerMode} from "@/lib/answer";

const startSchema = z.object({
  lessonKey: z.string().optional().nullable(),
  mode: z.enum(["kana", "kanji", "flexible"]),
});

function failure(message: string, status: number) {
  return NextResponse.json({error: message}, {status});
}

async function resolveLesson(client: SupabaseClient, key: string | null) {
  if (!key) return null;
  const lesson = lessons.find(entry => entry.id === key);
  if (!lesson) throw new Error("Bài học không hợp lệ.");
  const {data: edition, error: editionError} = await client.from("textbook_editions")
    .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single();
  if (editionError) throw editionError;
  const {data: volume, error: volumeError} = await client.from("textbook_volumes")
    .select("id").eq("edition_id", edition.id).eq("volume_number", lesson.volume).single();
  if (volumeError) throw volumeError;
  const {data: row, error: lessonError} = await client.from("lessons")
    .select("id").eq("volume_id", volume.id).eq("lesson_number", lesson.number)
    .eq("is_active", true).single();
  if (lessonError) throw lessonError;
  return row.id as string;
}

async function loadSession(client: SupabaseClient, userId: string, sessionId: string): Promise<LiveSession> {
  const {data: session, error: sessionError} = await client.from("study_sessions")
    .select("id,lesson_id,metadata").eq("id", sessionId).eq("user_id", userId)
    .eq("session_type", "flashcard").eq("status", "active").single();
  if (sessionError) throw sessionError;
  const {data: rows, error: rowsError} = await client.from("session_cards")
    .select("id,flashcard_id,position,graded_once,is_correct,retry_completed_at")
    .eq("session_id", sessionId).order("position");
  if (rowsError) throw rowsError;
  const cardIds = (rows ?? []).map(row => row.flashcard_id as string);
  if (cardIds.length === 0) throw new Error("Phiên học không có thẻ.");
  const {data: flashcards, error: cardsError} = await client.from("flashcards")
    .select("id,prompt_japanese,prompt_kana,meaning,accepted_answers").eq("user_id", userId).in("id", cardIds);
  if (cardsError) throw cardsError;
  const byId = new Map((flashcards ?? []).map(card => [card.id as string, card]));
  const cards: LiveCard[] = (rows ?? []).map(row => {
    const flashcard = byId.get(row.flashcard_id as string);
    if (!flashcard) throw new Error("Một thẻ trong phiên không còn khả dụng.");
    return {
      sessionCardId: row.id as string,
      flashcardId: row.flashcard_id as string,
      position: row.position as number,
      japanese: flashcard.prompt_japanese as string,
      kana: flashcard.prompt_kana as string | null,
      meaning: flashcard.meaning as string,
      acceptedAnswers: flashcard.accepted_answers as string[],
      graded: row.graded_once as boolean,
      correct: row.is_correct as boolean | null,
      retryCompleted: Boolean(row.retry_completed_at),
    };
  });
  const metadata = session.metadata as Record<string, unknown> | null;
  const modeValue = metadata?.answer_mode;
  const mode: AnswerMode = modeValue === "kana" || modeValue === "kanji" ? modeValue : "flexible";
  return {id: session.id as string, lessonId: session.lesson_id as string | null, mode, cards};
}

function snapshot(session: LiveSession | null, dueCount: number) {
  const body: StudySnapshot = {
    session, dueCount, gradingReady: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  return NextResponse.json(body, {headers: {"Cache-Control": "no-store"}});
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập để ôn tập.", 401);
  try {
    const {client, user} = auth;
    const key = new URL(request.url).searchParams.get("lessonKey");
    const lessonId = await resolveLesson(client, key);

    // Look for active session matching the requested lesson (or general review if null)
    let activeQuery = client.from("study_sessions")
      .select("id,lesson_id").eq("user_id", user.id).eq("session_type", "flashcard")
      .eq("status", "active").order("started_at", {ascending: false});

    if (lessonId) {
      activeQuery = activeQuery.eq("lesson_id", lessonId);
    } else {
      activeQuery = activeQuery.is("lesson_id", null);
    }

    const {data: active, error: activeError} = await activeQuery.limit(1).maybeSingle();
    if (activeError) throw activeError;
    if (active) return snapshot(await loadSession(client, user.id, active.id), 0);

    let query = client.from("flashcards").select("id", {head: true, count: "exact"})
      .eq("user_id", user.id).is("suspended_at", null).lte("due_at", new Date().toISOString());

    if (lessonId) {
      query = query.eq("lesson_id", lessonId);
    } else {
      // General review: count due cards only from lessons in progress or completed
      const {data: activeLessons} = await client.from("user_lesson_progress")
        .select("lesson_id").eq("user_id", user.id).in("status", ["in_progress", "completed"]);
      if (activeLessons && activeLessons.length > 0) {
        query = query.in("lesson_id", activeLessons.map(l => l.lesson_id));
      }
    }
    const {count, error} = await query;
    if (error) throw error;
    return snapshot(null, count ?? 0);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Không tải được phiên học.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập để ôn tập.", 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return failure("Máy chủ chưa cấu hình khóa chấm điểm an toàn.", 503);
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Thông tin bắt đầu phiên học không hợp lệ.", 400);
  try {
    const lessonId = await resolveLesson(auth.client, parsed.data.lessonKey ?? null);

    // Auto mark lesson as in_progress when starting its flashcard session
    if (lessonId && parsed.data.lessonKey) {
      const {data: currentProgress} = await auth.client.from("user_lesson_progress")
        .select("status").eq("user_id", auth.user.id).eq("lesson_id", lessonId).maybeSingle();
      if (!currentProgress || currentProgress.status === "not_started") {
        await auth.client.from("user_lesson_progress").upsert({
          user_id: auth.user.id,
          lesson_id: lessonId,
          status: "in_progress",
        }, {onConflict: "user_id,lesson_id"});
      }
    }

    const {data: sessionId, error} = await auth.client.rpc("start_flashcard_session", {
      p_lesson_id: lessonId, p_answer_mode: parsed.data.mode,
    });
    if (error) throw error;
    if (!sessionId) return snapshot(null, 0);
    return snapshot(await loadSession(auth.client, auth.user.id, sessionId as string), 0);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Không bắt đầu được phiên học.", 500);
  }
}
