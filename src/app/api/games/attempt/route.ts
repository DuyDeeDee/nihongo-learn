import {NextResponse} from "next/server";
import {z} from "zod";
import {getAuthenticatedClient, getTrustedClient} from "@/lib/supabase-server";

const schema = z.object({
  attemptKey: z.uuid(), questionId: z.uuid(),
  gameType: z.enum(["sentence_builder", "particle_master"]),
  answer: z.union([z.string().trim().min(1).max(500), z.array(z.string().trim().min(1).max(500)).min(1).max(12)]),
  elapsedMs: z.number().int().min(0).max(86_400_000),
});

function failure(message: string, status: number) {
  return NextResponse.json({error: message}, {status});
}

function result(row: {is_correct: boolean; score: number; payload: unknown}) {
  const payload = row.payload as Record<string, unknown>;
  return NextResponse.json({correct: row.is_correct, score: row.score,
    answer: payload.answer, acceptedAnswers: payload.accepted_answers,
    explanation: payload.explanation}, {headers: {"Cache-Control": "no-store"}});
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const trusted = getTrustedClient();
  if (!trusted) return failure("Máy chủ chưa cấu hình khóa lưu kết quả trò chơi.", 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Lượt chơi không hợp lệ.", 400);
  const {attemptKey, questionId, gameType, answer, elapsedMs} = parsed.data;
  const questionType = gameType === "sentence_builder" ? "ordering" : "particle";
  try {
    const {data: question, error: questionError} = await auth.client.from("quiz_questions")
      .select("id,lesson_id,prompt,options,accepted_answers,explanation")
      .eq("id", questionId).eq("user_id", auth.user.id).eq("question_type", questionType).single();
    if (questionError) return failure("Không tìm thấy câu chơi của bạn.", 404);
    const {data: oldSession, error: sessionReadError} = await auth.client.from("study_sessions")
      .select("id,metadata").eq("id", attemptKey).eq("user_id", auth.user.id)
      .eq("session_type", "game").maybeSingle();
    if (sessionReadError) throw sessionReadError;
    if (oldSession) {
      const metadata = oldSession.metadata as Record<string, unknown>;
      if (metadata.question_id !== questionId || metadata.game_type !== gameType) return failure("Mã lượt chơi đã dùng cho câu hỏi khác.", 409);
      const {data: oldAttempt, error: oldAttemptError} = await auth.client.from("game_attempts")
        .select("is_correct,score,payload").eq("session_id", attemptKey)
        .eq("user_id", auth.user.id).maybeSingle();
      if (oldAttemptError) throw oldAttemptError;
      if (oldAttempt) return result(oldAttempt);
    }
    const options = question.options as string[];
    const expected = question.accepted_answers as string[];
    let correct: boolean;
    if (gameType === "sentence_builder") {
      const sortedAnswer = Array.isArray(answer) ? [...answer].sort() : [];
      const sortedOptions = [...options].sort();
      if (!Array.isArray(answer) || answer.length !== options.length ||
        !sortedAnswer.every((value, index) => value === sortedOptions[index])) {
        return failure("Hãy dùng đủ các mảnh câu đúng một lần.", 400);
      }
      const tokenMatch = answer.length === expected.length && answer.every((token, index) => token === expected[index]);
      const normAnswer = answer.join("").replace(/[。、\s\.\,\?？\!！]/g, "").normalize("NFKC");
      const normExpected = expected.join("").replace(/[。、\s\.\,\?？\!！]/g, "").normalize("NFKC");
      const sentenceMatch = normAnswer === normExpected;
      correct = tokenMatch || sentenceMatch;
    } else {
      if (typeof answer !== "string" || !options.includes(answer)) return failure("Trợ từ không hợp lệ.", 400);
      correct = expected.some(value => value.normalize("NFKC").trim() === answer.normalize("NFKC").trim());
    }
    if (!oldSession) {
      const now = new Date().toISOString();
      const {error: insertSessionError} = await trusted.from("study_sessions").insert({
        id: attemptKey, user_id: auth.user.id, lesson_id: question.lesson_id,
        session_type: "game", status: "completed", started_at: now, ended_at: now,
        cards_seen: 1, correct_count: correct ? 1 : 0,
        metadata: {question_id: questionId, game_type: gameType},
      });
      if (insertSessionError) {
        if (insertSessionError.code !== "23505") throw insertSessionError;
        const {data: existing, error: existingError} = await trusted.from("study_sessions")
          .select("user_id,metadata").eq("id", attemptKey).single();
        if (existingError) throw existingError;
        const metadata = existing.metadata as Record<string, unknown>;
        if (existing.user_id !== auth.user.id || metadata.question_id !== questionId || metadata.game_type !== gameType) {
          return failure("Mã lượt chơi đã được sử dụng.", 409);
        }
      }
    }
    const payload = {question_id: questionId, prompt: question.prompt, answer,
      accepted_answers: expected, explanation: question.explanation};
    const {data: saved, error: saveError} = await trusted.from("game_attempts").insert({
      user_id: auth.user.id, session_id: attemptKey, game_type: gameType,
      lesson_id: question.lesson_id, payload, is_correct: correct,
      score: correct ? 100 : 0, duration_ms: elapsedMs,
    }).select("is_correct,score,payload").single();
    if (saveError) {
      if (saveError.code !== "23505") throw saveError;
      const {data: raced, error: racedError} = await auth.client.from("game_attempts")
        .select("is_correct,score,payload").eq("session_id", attemptKey)
        .eq("user_id", auth.user.id).single();
      if (racedError) throw racedError;
      return result(raced);
    }
    return result(saved);
  } catch {
    return failure("Không lưu được lượt chơi.", 500);
  }
}
