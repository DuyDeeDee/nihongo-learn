import {NextResponse} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {accuracy, previousDayKey, streakFromDays, studyDayKey, type LessonProgress, type Mistake, type ProgressSnapshot} from "@/lib/progress";
import {getAuthenticatedClient} from "@/lib/supabase-server";

type Flashcard = {id: string; lesson_id: string; prompt_japanese: string; prompt_kana: string | null;
  meaning: string; accepted_answers: string[]; due_at: string; reps: number; suspended_at: string | null};
type ReviewLog = {flashcard_id: string; answer: string | null; is_correct: boolean;
  reviewed_at: string; elapsed_ms: number | null};
type TimedAttempt = {is_correct: boolean; elapsed_ms?: number | null; duration_ms?: number | null;
  attempted_at?: string; created_at?: string};

async function allRows<T>(client: SupabaseClient, table: string, columns: string, userId: string, orderColumn: string) {
  const rows: T[] = [];
  while (true) {
    const {data, error} = await client.from(table).select(columns).eq("user_id", userId)
      .order(orderColumn, {ascending: false}).range(rows.length, rows.length + 999);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

export async function GET() {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  try {
    const {client, user} = auth;
    const {data: edition, error: editionError} = await client.from("textbook_editions")
      .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single();
    if (editionError) throw editionError;
    const {data: volumes, error: volumeError} = await client.from("textbook_volumes")
      .select("id,volume_number").eq("edition_id", edition.id);
    if (volumeError) throw volumeError;
    const [catalog, prefs, cards, vocabulary, grammar, savedProgress, logs, quizAttempts, gameAttempts] = await Promise.all([
      client.from("lessons").select("id,volume_id,lesson_number").in("volume_id", volumes.map(volume => volume.id)),
      client.from("user_preferences").select("timezone,review_reset_hour,daily_goal").eq("user_id", user.id).maybeSingle(),
      allRows<Flashcard>(client, "flashcards", "id,lesson_id,prompt_japanese,prompt_kana,meaning,accepted_answers,due_at,reps,suspended_at", user.id, "created_at"),
      allRows<{lesson_id: string}>(client, "vocabulary_items", "lesson_id", user.id, "created_at"),
      allRows<{lesson_id: string}>(client, "grammar_items", "lesson_id", user.id, "created_at"),
      allRows<{lesson_id: string; status: LessonProgress["status"]; quiz_best_score: number | null}>(
        client, "user_lesson_progress", "lesson_id,status,quiz_best_score", user.id, "updated_at"),
      allRows<ReviewLog>(client, "review_logs", "flashcard_id,answer,is_correct,reviewed_at,elapsed_ms", user.id, "reviewed_at"),
      allRows<TimedAttempt>(client, "quiz_attempts", "is_correct,elapsed_ms,attempted_at", user.id, "attempted_at"),
      allRows<TimedAttempt>(client, "game_attempts", "is_correct,duration_ms,created_at", user.id, "created_at"),
    ]);
    if (catalog.error) throw catalog.error;
    if (prefs.error) throw prefs.error;
    const timezone = prefs.data?.timezone ?? "Asia/Ho_Chi_Minh";
    const resetHour = prefs.data?.review_reset_hour ?? 4;
    const dailyGoal = prefs.data?.daily_goal ?? 20;
    const today = studyDayKey(new Date(), timezone, resetHour);
    const volumeNumbers = new Map(volumes.map(volume => [volume.id, volume.volume_number]));
    const lessonById = new Map((catalog.data ?? []).map(row => [row.id, row]));
    const countByLesson = (rows: {lesson_id: string}[]) => {
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.lesson_id, (counts.get(row.lesson_id) ?? 0) + 1);
      return counts;
    };
    const vocabCounts = countByLesson(vocabulary);
    const grammarCounts = countByLesson(grammar);
    const progressByLesson = new Map(savedProgress.map(row => [row.lesson_id, row]));
    const lessonStats: LessonProgress[] = (catalog.data ?? []).map(row => {
      const volume = Number(volumeNumbers.get(row.volume_id));
      const saved = progressByLesson.get(row.id);
      const vocabularyCount = vocabCounts.get(row.id) ?? 0;
      const grammarCount = grammarCounts.get(row.id) ?? 0;
      return {key: `minna-2e-${volume}-${row.lesson_number}`, number: row.lesson_number,
        volume, vocabularyCount, grammarCount,
        status: saved?.status ?? (vocabularyCount + grammarCount > 0 ? "in_progress" : "not_started"),
        quizBestScore: saved?.quiz_best_score ?? null};
    }).sort((a, b) => a.number - b.number);
    const cardById = new Map(cards.map(card => [card.id, card]));
    const now = Date.now();
    const activeCards = cards.filter(card => !card.suspended_at);
    const dueCount = activeCards.filter(card => new Date(card.due_at).getTime() <= now).length;
    const activity = [
      ...logs.map(row => ({date: row.reviewed_at, ms: row.elapsed_ms ?? 0})),
      ...quizAttempts.map(row => ({date: row.attempted_at!, ms: row.elapsed_ms ?? 0})),
      ...gameAttempts.map(row => ({date: row.created_at!, ms: row.duration_ms ?? 0})),
    ];
    const dayKeys = new Set(activity.map(row => studyDayKey(new Date(row.date), timezone, resetHour)));
    const todayMs = activity.filter(row => studyDayKey(new Date(row.date), timezone, resetHour) === today)
      .reduce((sum, row) => sum + row.ms, 0);
    let recentDay = today;
    let activeDaysLast7 = 0;
    for (let i = 0; i < 7; i += 1) {
      if (dayKeys.has(recentDay)) activeDaysLast7 += 1;
      recentDay = previousDayKey(recentDay);
    }
    const latestByCard = new Map<string, ReviewLog>();
    for (const log of logs) if (!latestByCard.has(log.flashcard_id)) latestByCard.set(log.flashcard_id, log);
    const mistakes: Mistake[] = [];
    for (const [cardId, log] of latestByCard) {
      if (log.is_correct) continue;
      const card = cardById.get(cardId);
      if (!card || card.suspended_at) continue;
      const lesson = lessonById.get(card.lesson_id);
      const volume = lesson ? volumeNumbers.get(lesson.volume_id) : null;
      mistakes.push({flashcardId: cardId,
        lessonKey: lesson && volume ? `minna-2e-${volume}-${lesson.lesson_number}` : null,
        japanese: card.prompt_japanese, kana: card.prompt_kana, meaning: card.meaning,
        acceptedAnswers: card.accepted_answers, typedAnswer: log.answer,
        reviewedAt: log.reviewed_at});
      if (mistakes.length >= 30) break;
    }
    const snapshot: ProgressSnapshot = {
      timezone, resetHour, dailyGoal, todayMinutes: Math.round(todayMs / 60000 * 10) / 10,
      streak: streakFromDays(dayKeys, today), activeDaysLast7,
      dueCount, flashcardCount: activeCards.length,
      newCount: activeCards.filter(card => card.reps === 0).length,
      learningCount: activeCards.filter(card => card.reps > 0 && card.reps < 3).length,
      reviewCount: activeCards.filter(card => card.reps >= 3).length,
      flashcardAccuracy: accuracy(logs.filter(row => row.is_correct).length, logs.length),
      quizAccuracy: accuracy(quizAttempts.filter(row => row.is_correct).length, quizAttempts.length),
      gameAccuracy: accuracy(gameAttempts.filter(row => row.is_correct).length, gameAttempts.length),
      completedLessons: lessonStats.filter(lesson => lesson.status === "completed").length,
      lessons: lessonStats, mistakes,
    };
    return NextResponse.json(snapshot, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "Không tải được tiến độ của bạn."}, {status: 500});
  }
}
