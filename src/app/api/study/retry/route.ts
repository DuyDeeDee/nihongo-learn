import {NextResponse} from "next/server";
import {z} from "zod";
import {checkAnswer} from "@/lib/answer";
import {getAuthenticatedClient, getTrustedClient} from "@/lib/supabase-server";
import {loadStudyCard} from "@/lib/study-server";

const retrySchema = z.object({
  sessionCardId: z.uuid(),
  answer: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const trusted = getTrustedClient();
  if (!trusted) return NextResponse.json({error: "Máy chủ chưa cấu hình khóa chấm điểm an toàn."}, {status: 503});
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error: "Đáp án không hợp lệ."}, {status: 400});
  try {
    const {sessionCard, session, flashcard, mode} = await loadStudyCard(
      auth.client, auth.user.id, parsed.data.sessionCardId,
    );
    if (session.status !== "active" || !sessionCard.graded_once || sessionCard.is_correct || sessionCard.retry_completed_at) {
      return NextResponse.json({error: "Lượt luyện lại không khả dụng."}, {status: 409});
    }
    const correct = checkAnswer(parsed.data.answer, flashcard.accepted_answers as string[], mode);
    const {error} = await trusted.rpc("record_flashcard_retry_trusted", {
      p_user_id: auth.user.id,
      p_session_card_id: sessionCard.id,
      p_answer: parsed.data.answer,
      p_is_correct: correct,
    });
    if (error) throw error;
    return NextResponse.json({correct}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Không lưu được lượt luyện lại.",
    }, {status: 500});
  }
}
