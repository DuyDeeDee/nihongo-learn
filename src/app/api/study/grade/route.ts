import {NextResponse} from "next/server";
import {z} from "zod";
import {checkAnswer} from "@/lib/answer";
import {scheduleReview, Rating, type Card} from "@/lib/srs";
import {getAuthenticatedClient, getTrustedClient} from "@/lib/supabase-server";
import {loadStudyCard} from "@/lib/study-server";

const gradeSchema = z.object({
  sessionCardId: z.uuid(),
  answer: z.string().trim().min(1).max(500),
  rating: z.enum(["again", "hard", "good", "easy"]),
  elapsedMs: z.number().int().min(0).max(86_400_000),
});

function ratingValue(rating: "again" | "hard" | "good" | "easy") {
  return {again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy}[rating];
}

function restoreCard(state: unknown): Card | undefined {
  if (!state || typeof state !== "object" || Object.keys(state).length === 0) return undefined;
  const saved = state as Record<string, unknown>;
  const due = new Date(String(saved.due));
  const lastReview = saved.last_review ? new Date(String(saved.last_review)) : undefined;
  if (Number.isNaN(due.getTime()) || (lastReview && Number.isNaN(lastReview.getTime()))) {
    throw new Error("Trạng thái thẻ không hợp lệ.");
  }
  return {...saved, due, last_review: lastReview} as Card;
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const trusted = getTrustedClient();
  if (!trusted) return NextResponse.json({error: "Máy chủ chưa cấu hình khóa chấm điểm an toàn."}, {status: 503});
  const parsed = gradeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error: "Đáp án không hợp lệ."}, {status: 400});

  try {
    const {sessionCard, session, flashcard, mode} = await loadStudyCard(
      auth.client, auth.user.id, parsed.data.sessionCardId,
    );
    if (session.status !== "active" && !sessionCard.graded_once) {
      return NextResponse.json({error: "Phiên học đã kết thúc."}, {status: 409});
    }
    let logId: string;
    if (sessionCard.graded_once) {
      const {data: previous, error} = await auth.client.from("review_logs")
        .select("id").eq("session_card_id", sessionCard.id).eq("user_id", auth.user.id).single();
      if (error) throw error;
      logId = previous.id as string;
    } else {
      if (flashcard.suspended_at) return NextResponse.json({error: "Thẻ đã bị tạm dừng."}, {status: 409});
      const correct = checkAnswer(
        parsed.data.answer, flashcard.accepted_answers as string[], mode,
      );
      if ((correct && parsed.data.rating === "again") || (!correct && parsed.data.rating !== "again")) {
        return NextResponse.json({error: "Mức độ nhớ không khớp với đáp án."}, {status: 400});
      }
      const scheduled = scheduleReview(
        restoreCard(flashcard.fsrs_state), ratingValue(parsed.data.rating),
      );
      const {data, error} = await trusted.rpc("grade_session_card_trusted", {
        p_user_id: auth.user.id,
        p_session_card_id: sessionCard.id,
        p_rating: parsed.data.rating,
        p_answer: parsed.data.answer,
        p_is_correct: correct,
        p_elapsed_ms: parsed.data.elapsedMs,
        p_scheduled_days: scheduled.scheduledDays,
        p_expected_due_at: flashcard.due_at,
        p_expected_reps: flashcard.reps,
        p_next_due_at: scheduled.nextDue.toISOString(),
        p_fsrs_state: scheduled.card,
      });
      if (error) {
        const stale = error.message.includes("Card state changed");
        return NextResponse.json({error: error.message}, {status: stale ? 409 : 500});
      }
      logId = data as string;
    }
    const {data: log, error: logError} = await auth.client.from("review_logs")
      .select("id,rating,is_correct").eq("id", logId).eq("user_id", auth.user.id).single();
    if (logError) throw logError;
    const {data: current, error: currentError} = await auth.client.from("flashcards")
      .select("due_at").eq("id", flashcard.id).eq("user_id", auth.user.id).single();
    if (currentError) throw currentError;
    return NextResponse.json({
      logId: log.id, correct: log.is_correct, rating: log.rating, dueAt: current.due_at,
    }, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Không lưu được kết quả ôn tập.",
    }, {status: 500});
  }
}
