import {NextResponse} from "next/server";
import {z} from "zod";
import {lessons} from "@/lib/data";
import {resolveLessonId} from "@/lib/lesson-catalog";
import {getAuthenticatedClient, getTrustedClient} from "@/lib/supabase-server";

const startSchema = z.object({lessonKey: z.string()});
const finishSchema = z.object({sessionId: z.uuid()});

function failure(message: string, status: number) {
  return NextResponse.json({error: message}, {status});
}

async function loadSession(client: NonNullable<Awaited<ReturnType<typeof getAuthenticatedClient>>>["client"], userId: string, sessionId: string) {
  const {data: session, error: sessionError} = await client.from("study_sessions")
    .select("id,lesson_id,metadata,status").eq("id", sessionId)
    .eq("user_id", userId).eq("session_type", "quiz").single();
  if (sessionError) throw sessionError;
  const rawIds = (session.metadata as Record<string, unknown> | null)?.question_ids;
  const ids = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : [];
  if (ids.length === 0) throw new Error("Phiên Quiz không có câu hỏi.");
  const {data: questions, error: questionError} = await client.from("quiz_questions")
    .select("id,prompt,question_type,options,difficulty").eq("user_id", userId)
    .eq("lesson_id", session.lesson_id).in("id", ids);
  if (questionError) throw questionError;
  const byId = new Map((questions ?? []).map(question => [question.id, question]));
  const {data: attempts, error: attemptError} = await client.from("quiz_attempts")
    .select("question_id,answer,is_correct").eq("user_id", userId).eq("session_id", sessionId);
  if (attemptError) throw attemptError;
  return {
    id: session.id,
    lessonId: session.lesson_id,
    status: session.status,
    questions: ids.map(id => byId.get(id)).filter(question => question !== undefined),
    attempts: attempts ?? [],
  };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const key = new URL(request.url).searchParams.get("lessonKey") ?? "";
  if (!lessons.some(lesson => lesson.id === key)) return failure("Bài học không hợp lệ.", 400);
  try {
    const lessonId = await resolveLessonId(auth.client, key);
    const {data, error} = await auth.client.from("study_sessions")
      .select("id").eq("user_id", auth.user.id).eq("lesson_id", lessonId)
      .eq("session_type", "quiz").eq("status", "active")
      .order("started_at", {ascending: false}).limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({session: data ? await loadSession(auth.client, auth.user.id, data.id) : null},
      {headers: {"Cache-Control": "no-store"}});
  } catch {
    return failure("Không tải được phiên Quiz.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const trusted = getTrustedClient();
  if (!trusted) return failure("Máy chủ chưa cấu hình khóa lưu kết quả Quiz.", 503);
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !lessons.some(lesson => lesson.id === parsed.data.lessonKey)) {
    return failure("Bài học không hợp lệ.", 400);
  }
  try {
    const lessonId = await resolveLessonId(auth.client, parsed.data.lessonKey);
    const {data: currentProgress} = await auth.client.from("user_lesson_progress")
      .select("status").eq("user_id", auth.user.id).eq("lesson_id", lessonId).maybeSingle();
    if (!currentProgress || currentProgress.status === "not_started") {
      await auth.client.from("user_lesson_progress").upsert({
        user_id: auth.user.id,
        lesson_id: lessonId,
        status: "in_progress",
      }, {onConflict: "user_id,lesson_id"});
    }
    const {data: active, error: activeError} = await auth.client.from("study_sessions")
      .select("id").eq("user_id", auth.user.id).eq("lesson_id", lessonId)
      .eq("session_type", "quiz").eq("status", "active")
      .order("started_at", {ascending: false}).limit(1).maybeSingle();
    if (activeError) throw activeError;
    if (active) return NextResponse.json({session: await loadSession(auth.client, auth.user.id, active.id)});
    const {data: questions, error: questionError} = await auth.client.from("quiz_questions")
      .select("id").eq("user_id", auth.user.id).eq("lesson_id", lessonId)
      .in("question_type", ["multiple_choice", "typed"])
      .order("created_at").order("id").limit(20);
    if (questionError) throw questionError;
    if (!questions?.length) return failure("Bài này chưa có câu hỏi Quiz.", 409);
    const {data: session, error: sessionError} = await trusted.from("study_sessions")
      .insert({user_id: auth.user.id, lesson_id: lessonId, session_type: "quiz",
        metadata: {question_ids: questions.map(question => question.id)}})
      .select("id").single();
    if (sessionError?.code === "23505") {
      const {data: raced, error: racedError} = await auth.client.from("study_sessions")
        .select("id").eq("user_id", auth.user.id).eq("lesson_id", lessonId)
        .eq("session_type", "quiz").eq("status", "active")
        .order("started_at", {ascending: false}).limit(1).single();
      if (racedError) throw racedError;
      return NextResponse.json({session: await loadSession(auth.client, auth.user.id, raced.id)});
    }
    if (sessionError) throw sessionError;
    return NextResponse.json({session: await loadSession(auth.client, auth.user.id, session.id)}, {status: 201});
  } catch {
    return failure("Không bắt đầu được Quiz.", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const trusted = getTrustedClient();
  if (!trusted) return failure("Máy chủ chưa cấu hình khóa lưu kết quả Quiz.", 503);
  const parsed = finishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Phiên Quiz không hợp lệ.", 400);
  try {
    const session = await loadSession(auth.client, auth.user.id, parsed.data.sessionId);
    const total = session.questions.length;
    if (session.attempts.length < total) return failure("Hãy trả lời tất cả câu hỏi trước khi kết thúc.", 409);
    const correct = session.attempts.filter(attempt => attempt.is_correct).length;
    const score = total > 0 ? Math.round(correct * 10000 / total) / 100 : 0;
    if (session.status === "active") {
      const {error} = await trusted.from("study_sessions")
        .update({status: "completed", ended_at: new Date().toISOString(), cards_seen: total, correct_count: correct})
        .eq("id", session.id).eq("user_id", auth.user.id).eq("status", "active");
      if (error) throw error;
    }
    const {data: existing, error: progressError} = await auth.client.from("user_lesson_progress")
        .select("quiz_best_score").eq("user_id", auth.user.id)
        .eq("lesson_id", session.lessonId).maybeSingle();
    if (progressError) throw progressError;
    const best = Math.max(Number(existing?.quiz_best_score ?? 0), score);
    const saveResult = existing
        ? await auth.client.from("user_lesson_progress").update({quiz_best_score: best})
            .eq("user_id", auth.user.id).eq("lesson_id", session.lessonId)
        : await auth.client.from("user_lesson_progress")
            .insert({user_id: auth.user.id, lesson_id: session.lessonId,
              quiz_best_score: best, status: "in_progress"});
    const {error: saveError} = saveResult;
    if (saveError) throw saveError;
    return NextResponse.json({correct, total, score});
  } catch {
    return failure("Không lưu được tổng kết Quiz.", 500);
  }
}
