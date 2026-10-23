import {NextResponse} from "next/server";
import {z} from "zod";
import {lessons} from "@/lib/data";
import {resolveLessonId} from "@/lib/lesson-catalog";
import {getAuthenticatedClient} from "@/lib/supabase-server";

const schema = z.object({lessonKey: z.string(),
  status: z.enum(["not_started", "in_progress", "completed"])});

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !lessons.some(lesson => lesson.id === parsed.data.lessonKey)) {
    return NextResponse.json({error: "Trạng thái bài học không hợp lệ."}, {status: 400});
  }
  try {
    const lessonId = await resolveLessonId(auth.client, parsed.data.lessonKey);
    const {error} = await auth.client.from("user_lesson_progress").upsert({
      user_id: auth.user.id, lesson_id: lessonId, status: parsed.data.status,
      completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null,
    }, {onConflict: "user_id,lesson_id"});
    if (error) throw error;
    return NextResponse.json({status: parsed.data.status});
  } catch {
    return NextResponse.json({error: "Không lưu được trạng thái bài học."}, {status: 500});
  }
}
