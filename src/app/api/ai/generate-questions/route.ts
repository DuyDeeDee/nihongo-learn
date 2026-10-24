import { NextResponse } from "next/server";
import { lessons } from "@/lib/data";
import { generateQuestionsWithGemini } from "@/lib/gemini-question-generator";
import { resolveLessonId } from "@/lib/lesson-catalog";
import { getAuthenticatedClient } from "@/lib/supabase-server";

const columns = "id,prompt,question_type,options,accepted_answers,explanation,difficulty,created_at";

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để sử dụng tính năng sinh câu hỏi AI." }, { status: 401 });
  }

  let body: {
    lessonKey?: string;
    kind?: "quiz" | "particle" | "ordering" | "all";
    count?: number;
    apiKey?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const { lessonKey, kind = "quiz", count = 5, apiKey } = body;
  if (!lessonKey) {
    return NextResponse.json({ error: "Thiếu thông tin bài học (lessonKey)." }, { status: 400 });
  }

  const lessonEntry = lessons.find(l => l.id === lessonKey);
  if (!lessonEntry) {
    return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  }

  const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
  if (!effectiveApiKey) {
    return NextResponse.json({
      error: "Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm GEMINI_API_KEY vào .env.local trên máy chủ hoặc nhập API Key vào ô cấu hình.",
      code: "MISSING_API_KEY",
    }, { status: 400 });
  }

  try {
    const lessonId = await resolveLessonId(auth.client, lessonKey);

    // Fetch existing vocabulary and grammar for contextual learning
    const [vocabRes, grammarRes] = await Promise.all([
      auth.client.from("vocabulary_items").select("japanese, kana, meaning").eq("user_id", auth.user.id).eq("lesson_id", lessonId),
      auth.client.from("grammar_items").select("pattern, explanation, example_japanese").eq("user_id", auth.user.id).eq("lesson_id", lessonId),
    ]);

    const vocabularies = vocabRes.data || [];
    const grammars = grammarRes.data || [];

    // Call Gemini 2.0 Flash
    const generated = await generateQuestionsWithGemini({
      lessonNumber: lessonEntry.number,
      volumeNumber: lessonEntry.volume,
      vocabularies,
      grammars,
      kind,
      count: Math.min(Math.max(count, 1), 15),
      apiKey: effectiveApiKey,
    });

    if (generated.length === 0) {
      return NextResponse.json({ error: "AI không tạo được câu hỏi nào phù hợp." }, { status: 500 });
    }

    const rowsToInsert = generated.map(q => ({
      user_id: auth.user.id,
      lesson_id: lessonId,
      prompt: q.prompt,
      question_type: q.question_type,
      options: q.options,
      accepted_answers: q.accepted_answers,
      explanation: q.explanation || null,
      difficulty: q.difficulty,
    }));

    const { data: inserted, error: insertError } = await auth.client
      .from("quiz_questions")
      .insert(rowsToInsert)
      .select(columns);

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      count: inserted?.length || 0,
      questions: inserted || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đã xảy ra lỗi khi tạo câu hỏi bằng AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
