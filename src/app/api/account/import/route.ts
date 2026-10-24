import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để nhập dữ liệu." }, { status: 401 });
  }

  const { client, user } = auth;

  let body: {
    format?: string;
    tables?: Record<string, Array<Record<string, unknown>>>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Tệp JSON không hợp lệ." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !body.tables) {
    return NextResponse.json({
      error: "Định dạng tệp không khớp với Nihongo Quest export (thiếu trường 'tables').",
    }, { status: 400 });
  }

  const tables = body.tables;
  const stats = {
    vocabulary: 0,
    grammar: 0,
    quiz: 0,
    progress: 0,
    preferences: false,
  };

  try {
    // 1. Restore User Preferences
    if (Array.isArray(tables.user_preferences) && tables.user_preferences.length > 0) {
      const pref = tables.user_preferences[0];
      const payload = {
        user_id: user.id,
        volume: Number(pref.volume) || 1,
        daily_goal: Number(pref.daily_goal) || 20,
        timezone: typeof pref.timezone === "string" ? pref.timezone : "Asia/Ho_Chi_Minh",
        review_reset_hour: Number(pref.review_reset_hour) || 4,
        answer_mode: pref.answer_mode === "kana" || pref.answer_mode === "kanji" ? pref.answer_mode : "flexible",
      };
      await client.from("user_preferences").upsert(payload, { onConflict: "user_id" });
      stats.preferences = true;
    }

    // 2. Restore Vocabulary Items
    if (Array.isArray(tables.vocabulary_items) && tables.vocabulary_items.length > 0) {
      const vocabRows = tables.vocabulary_items.map(row => ({
        id: typeof row.id === "string" ? row.id : undefined,
        user_id: user.id,
        lesson_id: row.lesson_id,
        japanese: String(row.japanese || "").trim(),
        kana: row.kana ? String(row.kana).trim() : null,
        meaning: String(row.meaning || "").trim(),
        part_of_speech: row.part_of_speech ? String(row.part_of_speech).trim() : null,
        example_japanese: row.example_japanese ? String(row.example_japanese).trim() : null,
        example_meaning: row.example_meaning ? String(row.example_meaning).trim() : null,
        source_note: row.source_note ? String(row.source_note).trim() : null,
      })).filter(r => r.japanese && r.meaning && r.lesson_id);

      if (vocabRows.length > 0) {
        // Upsert in batches of 100
        for (let i = 0; i < vocabRows.length; i += 100) {
          const chunk = vocabRows.slice(i, i + 100);
          const { error: vocabErr } = await client
            .from("vocabulary_items")
            .upsert(chunk, { onConflict: "id" });
          if (vocabErr) throw vocabErr;
        }
        stats.vocabulary = vocabRows.length;
      }
    }

    // 3. Restore Grammar Items
    if (Array.isArray(tables.grammar_items) && tables.grammar_items.length > 0) {
      const grammarRows = tables.grammar_items.map(row => ({
        id: typeof row.id === "string" ? row.id : undefined,
        user_id: user.id,
        lesson_id: row.lesson_id,
        pattern: String(row.pattern || "").trim(),
        explanation: String(row.explanation || "").trim(),
        example_japanese: row.example_japanese ? String(row.example_japanese).trim() : null,
        example_meaning: row.example_meaning ? String(row.example_meaning).trim() : null,
        source_note: row.source_note ? String(row.source_note).trim() : null,
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
      })).filter(r => r.pattern && r.explanation && r.lesson_id);

      if (grammarRows.length > 0) {
        for (let i = 0; i < grammarRows.length; i += 100) {
          const chunk = grammarRows.slice(i, i + 100);
          const { error: grammarErr } = await client
            .from("grammar_items")
            .upsert(chunk, { onConflict: "id" });
          if (grammarErr) throw grammarErr;
        }
        stats.grammar = grammarRows.length;
      }
    }

    // 4. Restore Quiz Questions
    if (Array.isArray(tables.quiz_questions) && tables.quiz_questions.length > 0) {
      const questionRows = tables.quiz_questions.map(row => ({
        id: typeof row.id === "string" ? row.id : undefined,
        user_id: user.id,
        lesson_id: row.lesson_id,
        prompt: String(row.prompt || "").trim(),
        question_type: String(row.question_type || "multiple_choice"),
        options: Array.isArray(row.options) ? row.options : [],
        accepted_answers: Array.isArray(row.accepted_answers) ? row.accepted_answers : [],
        explanation: row.explanation ? String(row.explanation).trim() : null,
        difficulty: Number(row.difficulty) || 3,
      })).filter(r => r.prompt && r.lesson_id);

      if (questionRows.length > 0) {
        for (let i = 0; i < questionRows.length; i += 100) {
          const chunk = questionRows.slice(i, i + 100);
          const { error: quizErr } = await client
            .from("quiz_questions")
            .upsert(chunk, { onConflict: "id" });
          if (quizErr) throw quizErr;
        }
        stats.quiz = questionRows.length;
      }
    }

    // 5. Restore Lesson Progress
    if (Array.isArray(tables.user_lesson_progress) && tables.user_lesson_progress.length > 0) {
      const progressRows = tables.user_lesson_progress.map(row => ({
        user_id: user.id,
        lesson_id: row.lesson_id,
        status: String(row.status || "not_started"),
        quiz_best_score: row.quiz_best_score !== null && row.quiz_best_score !== undefined ? Number(row.quiz_best_score) : null,
        completed_at: row.completed_at ? String(row.completed_at) : null,
      })).filter(r => r.lesson_id);

      if (progressRows.length > 0) {
        const { error: progErr } = await client
          .from("user_lesson_progress")
          .upsert(progressRows, { onConflict: "user_id,lesson_id" });
        if (progErr) throw progErr;
        stats.progress = progressRows.length;
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      message: `Nhập thành công: ${stats.vocabulary} từ vựng, ${stats.grammar} ngữ pháp, ${stats.quiz} câu hỏi!`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi khi nhập dữ liệu vào Supabase.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
