import {NextResponse} from "next/server";
import {z} from "zod";
import {gradeQuizAnswer, type QuizQuestion} from "@/lib/quiz-domain";
import {getAuthenticatedClient, getTrustedClient} from "@/lib/supabase-server";

const answerSchema = z.object({
  sessionId: z.uuid(),
  questionId: z.uuid(),
  answer: z.string().trim().min(1).max(500),
  elapsedMs: z.number().int().min(0).max(86_400_000),
});

function failure(message: string, status: number) {
  return NextResponse.json({error: message}, {status});
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const trusted = getTrustedClient();
  if (!trusted) return failure("Máy chủ chưa cấu hình khóa lưu kết quả Quiz.", 503);
  const parsed = answerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Đáp án không hợp lệ.", 400);
  const {sessionId, questionId, answer, elapsedMs} = parsed.data;
  try {
    const {data: session, error: sessionError} = await auth.client.from("study_sessions")
      .select("id,lesson_id,status,metadata").eq("id", sessionId)
      .eq("user_id", auth.user.id).eq("session_type", "quiz").single();
    if (sessionError) return failure("Không tìm thấy phiên Quiz của bạn.", 404);
    const ids = (session.metadata as Record<string, unknown> | null)?.question_ids;
    if (!Array.isArray(ids) || !ids.includes(questionId)) return failure("Câu hỏi không thuộc phiên Quiz này.", 400);
    const {data: question, error: questionError} = await auth.client.from("quiz_questions")
      .select("id,lesson_id,prompt,question_type,options,accepted_answers,explanation,difficulty,created_at")
      .eq("id", questionId).eq("user_id", auth.user.id).eq("lesson_id", session.lesson_id).single();
    if (questionError) return failure("Câu hỏi không còn khả dụng.", 404);

    const result = (attempt: {is_correct: boolean; answer: unknown}) => NextResponse.json({
      correct: attempt.is_correct, answer: attempt.answer,
      acceptedAnswers: question.accepted_answers, explanation: question.explanation,
    }, {headers: {"Cache-Control": "no-store"}});
    const {data: previous, error: previousError} = await auth.client.from("quiz_attempts")
      .select("answer,is_correct").eq("user_id", auth.user.id)
      .eq("session_id", sessionId).eq("question_id", questionId).maybeSingle();
    if (previousError) throw previousError;
    if (previous) return result(previous);
    if (session.status !== "active") return failure("Phiên Quiz đã kết thúc.", 409);
    const correct = gradeQuizAnswer(question as QuizQuestion, answer);
    const {data: inserted, error: insertError} = await trusted.from("quiz_attempts")
      .insert({user_id: auth.user.id, session_id: sessionId, question_id: questionId,
        answer, is_correct: correct, elapsed_ms: elapsedMs})
      .select("answer,is_correct").single();
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const {data: raced, error: racedError} = await auth.client.from("quiz_attempts")
        .select("answer,is_correct").eq("user_id", auth.user.id)
        .eq("session_id", sessionId).eq("question_id", questionId).single();
      if (racedError) throw racedError;
      return result(raced);
    }
    return result(inserted);
  } catch {
    return failure("Không lưu được câu trả lời Quiz.", 500);
  }
}
