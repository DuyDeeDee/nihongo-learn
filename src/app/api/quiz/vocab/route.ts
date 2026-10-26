import { NextResponse } from "next/server";
import { z } from "zod";
import { lessons } from "@/lib/data";
import { resolveLessonId } from "@/lib/lesson-catalog";
import { getAuthenticatedClient, getTrustedClient } from "@/lib/supabase-server";

// Fallback sample vocabulary for demo mode
const DEMO_VOCABULARY = [
  { id: "demo-1", japanese: "わたし", kana: "わたし", meaning: "tôi", part_of_speech: "Đại từ" },
  { id: "demo-2", japanese: "あなた", kana: "あなた", meaning: "anh/chị, ông/bà, bạn (ngôi thứ II)", part_of_speech: "Đại từ" },
  { id: "demo-3", japanese: "あの人", kana: "あのひと", meaning: "người kia, người đó", part_of_speech: "Đại từ" },
  { id: "demo-4", japanese: "あの方", kana: "あのかた", meaning: "vị kia (lịch sự của あの人)", part_of_speech: "Đại từ" },
  { id: "demo-5", japanese: "～さん", kana: "～さん", meaning: "anh, chị, ông, bà (hậu tố thêm sau tên)", part_of_speech: "Hậu tố" },
  { id: "demo-6", japanese: "先生", kana: "せんせい", meaning: "thầy/cô giáo", part_of_speech: "Danh từ" },
  { id: "demo-7", japanese: "教師", kana: "きょうし", meaning: "giáo viên (nghề nghiệp)", part_of_speech: "Danh từ" },
  { id: "demo-8", japanese: "学生", kana: "がくせい", meaning: "học sinh, sinh viên", part_of_speech: "Danh từ" },
  { id: "demo-9", japanese: "会社員", kana: "かいしゃいん", meaning: "nhân viên công ty", part_of_speech: "Danh từ" },
  { id: "demo-10", japanese: "社員", kana: "しゃいん", meaning: "nhân viên công ty (dùng kèm tên công ty)", part_of_speech: "Danh từ" },
  { id: "demo-11", japanese: "銀行員", kana: "ぎんこういん", meaning: "nhân viên ngân hàng", part_of_speech: "Danh từ" },
  { id: "demo-12", japanese: "医者", kana: "いしゃ", meaning: "bác sĩ", part_of_speech: "Danh từ" },
  { id: "demo-13", japanese: "研究者", kana: "けんきゅうしゃ", meaning: "nhà nghiên cứu", part_of_speech: "Danh từ" },
  { id: "demo-14", japanese: "大学", kana: "だいがく", meaning: "trường đại học", part_of_speech: "Danh từ" },
  { id: "demo-15", japanese: "病院", kana: "びょういん", meaning: "bệnh viện", part_of_speech: "Danh từ" },
  { id: "demo-16", japanese: "だれ", kana: "だれ", meaning: "ai (nghi vấn từ)", part_of_speech: "Đại từ nghi vấn" },
  { id: "demo-17", japanese: "どなた", kana: "どなた", meaning: "vị nào (lịch sự của だれ)", part_of_speech: "Đại từ nghi vấn" },
  { id: "demo-18", japanese: "～歳", kana: "～さい", meaning: "tuổi (hậu tố chỉ tuổi)", part_of_speech: "Hậu tố" },
  { id: "demo-19", japanese: "何歳", kana: "なんさい", meaning: "mấy tuổi, bao nhiêu tuổi", part_of_speech: "Đại từ nghi vấn" },
  { id: "demo-20", japanese: "おいくつ", kana: "おいくつ", meaning: "bao nhiêu tuổi (lịch sự của 何歳)", part_of_speech: "Đại từ nghi vấn" },
];

const finishVocabSchema = z.object({
  lessonKey: z.string(),
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  score: z.number().min(0).max(100),
  elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
});

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("lessonKey") ?? "";
  const lesson = lessons.find(l => l.id === key);
  if (!lesson) return failure("Bài học không hợp lệ.", 400);

  const auth = await getAuthenticatedClient();
  if (!auth) {
    // Return demo vocabulary
    return NextResponse.json({
      lessonKey: key,
      lessonId: null,
      items: DEMO_VOCABULARY,
      isDemo: true,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const lessonId = await resolveLessonId(auth.client, key);

    // Auto mark lesson as in_progress when starting its quiz
    const { data: currentProgress } = await auth.client.from("user_lesson_progress")
      .select("status").eq("user_id", auth.user.id).eq("lesson_id", lessonId).maybeSingle();
    if (!currentProgress || currentProgress.status === "not_started") {
      await auth.client.from("user_lesson_progress").upsert({
        user_id: auth.user.id,
        lesson_id: lessonId,
        status: "in_progress",
      }, { onConflict: "user_id,lesson_id" });
    }

    const { data: items, error } = await auth.client.from("vocabulary_items")
      .select("id,japanese,kana,meaning,part_of_speech")
      .eq("user_id", auth.user.id)
      .eq("lesson_id", lessonId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      lessonKey: key,
      lessonId,
      items: (items && items.length > 0) ? items : DEMO_VOCABULARY,
      isDemo: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : "Không tải được từ vựng cho bài học.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập để lưu kết quả.", 401);
  const trusted = getTrustedClient();
  if (!trusted) return failure("Máy chủ chưa cấu hình khóa lưu kết quả.", 503);

  const parsed = finishVocabSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Dữ liệu kết quả không hợp lệ.", 400);

  try {
    const { lessonKey, correct, total, score, elapsedMs } = parsed.data;
    const lessonId = await resolveLessonId(auth.client, lessonKey);

    // Save session record
    await trusted.from("study_sessions").insert({
      user_id: auth.user.id,
      lesson_id: lessonId,
      session_type: "quiz",
      status: "completed",
      ended_at: new Date().toISOString(),
      cards_seen: total,
      correct_count: correct,
      metadata: { quiz_type: "vocab", score, elapsedMs: elapsedMs ?? 0 },
    });

    // Update progress
    const { data: existing } = await auth.client.from("user_lesson_progress")
      .select("quiz_best_score, vocabulary_done").eq("user_id", auth.user.id)
      .eq("lesson_id", lessonId).maybeSingle();

    const best = Math.max(Number(existing?.quiz_best_score ?? 0), score);
    const vocabDone = Math.max(Number(existing?.vocabulary_done ?? 0), correct);

    if (existing) {
      await auth.client.from("user_lesson_progress").update({
        quiz_best_score: best,
        vocabulary_done: vocabDone,
      }).eq("user_id", auth.user.id).eq("lesson_id", lessonId);
    } else {
      await auth.client.from("user_lesson_progress").insert({
        user_id: auth.user.id,
        lesson_id: lessonId,
        quiz_best_score: best,
        vocabulary_done: vocabDone,
        status: "in_progress",
      });
    }

    return NextResponse.json({ success: true, score, correct, total });
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : "Không lưu được kết quả Quiz từ vựng.", 500);
  }
}
