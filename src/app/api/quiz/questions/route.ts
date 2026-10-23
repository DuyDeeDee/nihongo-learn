import {NextResponse} from "next/server";
import {z} from "zod";
import {lessons} from "@/lib/data";
import {resolveLessonId} from "@/lib/lesson-catalog";
import {getAuthenticatedClient} from "@/lib/supabase-server";

const questionSchema = z.object({
  lessonKey: z.string(),
  prompt: z.string().trim().min(1).max(2000),
  questionType: z.enum(["multiple_choice", "typed", "ordering", "particle"]),
  options: z.array(z.string().trim().min(1).max(500)).max(12),
  acceptedAnswers: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  explanation: z.string().trim().max(4000),
  difficulty: z.number().int().min(1).max(5),
}).refine(data => {
  if (data.questionType === "typed") return data.options.length === 0;
  if (data.questionType === "ordering") {
    if (data.options.length < 2 || data.options.length !== data.acceptedAnswers.length) return false;
    const options = [...data.options].sort();
    const answers = [...data.acceptedAnswers].sort();
    return options.every((value, index) => value === answers[index]);
  }
  return data.options.length >= 2 && data.options.length <= 6 && data.acceptedAnswers.length === 1 &&
    data.options.includes(data.acceptedAnswers[0]) && new Set(data.options).size === data.options.length;
}, {message: "Lựa chọn và đáp án đúng không khớp loại câu hỏi."});
const editSchema = z.object({id: z.uuid(), question: questionSchema});
const deleteSchema = z.object({id: z.uuid(), lessonKey: z.string()});
const columns = "id,prompt,question_type,options,accepted_answers,explanation,difficulty,created_at";

function failure(message: string, status: number) {
  return NextResponse.json({error: message}, {status});
}

function validLesson(key: string) {
  return lessons.some(lesson => lesson.id === key);
}

function rowValues(question: z.infer<typeof questionSchema>) {
  return {
    prompt: question.prompt,
    question_type: question.questionType,
    options: question.questionType === "typed" ? [] : question.options,
    accepted_answers: question.acceptedAnswers,
    explanation: question.explanation || null,
    difficulty: question.difficulty,
  };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const key = new URL(request.url).searchParams.get("lessonKey") ?? "";
  const kind = new URL(request.url).searchParams.get("kind") ?? "quiz";
  if (!validLesson(key)) return failure("Bài học không hợp lệ.", 400);
  if (!["quiz", "ordering", "particle"].includes(kind)) return failure("Loại câu hỏi không hợp lệ.", 400);
  try {
    const lessonId = await resolveLessonId(auth.client, key);
    let query = auth.client.from("quiz_questions")
      .select(columns).eq("user_id", auth.user.id).eq("lesson_id", lessonId)
      .order("created_at").order("id");
    query = kind === "quiz" ? query.in("question_type", ["multiple_choice", "typed"])
      : query.eq("question_type", kind);
    const {data, error} = await query;
    if (error) throw error;
    return NextResponse.json({lessonId, questions: data ?? []}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return failure("Không tải được câu hỏi của bài này.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Câu hỏi không hợp lệ.", 400);
  if (!validLesson(parsed.data.lessonKey)) return failure("Bài học không hợp lệ.", 400);
  try {
    const lessonId = await resolveLessonId(auth.client, parsed.data.lessonKey);
    const {data, error} = await auth.client.from("quiz_questions")
      .insert({...rowValues(parsed.data), user_id: auth.user.id, lesson_id: lessonId})
      .select(columns).single();
    if (error) throw error;
    return NextResponse.json({question: data}, {status: 201});
  } catch {
    return failure("Không thêm được câu hỏi.", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Câu hỏi không hợp lệ.", 400);
  if (!validLesson(parsed.data.question.lessonKey)) return failure("Bài học không hợp lệ.", 400);
  try {
    const lessonId = await resolveLessonId(auth.client, parsed.data.question.lessonKey);
    const {data, error} = await auth.client.from("quiz_questions")
      .update(rowValues(parsed.data.question)).eq("id", parsed.data.id)
      .eq("user_id", auth.user.id).eq("lesson_id", lessonId).select(columns).maybeSingle();
    if (error) throw error;
    if (!data) return failure("Không tìm thấy câu hỏi trong bài này.", 404);
    return NextResponse.json({question: data});
  } catch {
    return failure("Không sửa được câu hỏi.", 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return failure("Vui lòng đăng nhập.", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validLesson(parsed.data.lessonKey)) return failure("Câu hỏi không hợp lệ.", 400);
  try {
    const lessonId = await resolveLessonId(auth.client, parsed.data.lessonKey);
    const {data, error} = await auth.client.from("quiz_questions")
      .delete().eq("id", parsed.data.id).eq("user_id", auth.user.id)
      .eq("lesson_id", lessonId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return failure("Không tìm thấy câu hỏi trong bài này.", 404);
    return NextResponse.json({id: data.id});
  } catch {
    return failure("Không xóa được câu hỏi.", 500);
  }
}
