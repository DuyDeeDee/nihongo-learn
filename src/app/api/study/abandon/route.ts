import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase-server";

const schema = z.object({
  sessionId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const sessionId = parsed.success ? parsed.data?.sessionId : undefined;
  try {
    let query = auth.client.from("study_sessions")
      .update({ status: "abandoned", ended_at: new Date().toISOString() })
      .eq("user_id", auth.user.id)
      .eq("session_type", "flashcard")
      .eq("status", "active");
    if (sessionId) query = query.eq("id", sessionId);
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không hủy được phiên học." },
      { status: 500 }
    );
  }
}
