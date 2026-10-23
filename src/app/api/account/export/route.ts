import {NextResponse} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getAuthenticatedClient} from "@/lib/supabase-server";

const personalTables = [
  "user_preferences", "user_lesson_progress", "vocabulary_items", "grammar_items",
  "flashcards", "study_sessions", "review_logs", "quiz_questions", "quiz_attempts",
  "game_attempts", "achievements", "user_uploads",
] as const;

async function allOwned(client: SupabaseClient, table: string, userId: string) {
  const rows: Record<string, unknown>[] = [];
  while (true) {
    const {data, error} = await client.from(table).select("*").eq("user_id", userId)
      .order("id").range(rows.length, rows.length + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function GET() {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  try {
    const {client, user} = auth;
    const {data: profile, error: profileError} = await client.from("profiles")
      .select("*").eq("id", user.id).single();
    if (profileError) throw profileError;
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of personalTables) tables[table] = await allOwned(client, table, user.id);
    const sessionIds = tables.study_sessions.map(row => String(row.id));
    const sessionCards: Record<string, unknown>[] = [];
    for (let offset = 0; offset < sessionIds.length; offset += 50) {
      const ids = sessionIds.slice(offset, offset + 50);
      let page = 0;
      while (true) {
        const {data, error} = await client.from("session_cards").select("*")
          .in("session_id", ids).order("id").range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        sessionCards.push(...(data ?? []));
        if (!data || data.length < 1000) break;
        page += 1;
      }
    }
    tables.session_cards = sessionCards;
    const body = JSON.stringify({format: "nihongo-quest-export-v1", exportedAt: new Date().toISOString(),
      account: {id: user.id, email: user.email ?? null}, profile, tables,
      note: "Tệp tải lên trong Supabase Storage không nằm trong JSON này; chỉ có metadata trong user_uploads."}, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(body, {headers: {"Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nihongo-quest-${date}.json"`,
      "Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "Không xuất được dữ liệu. Vui lòng thử lại."}, {status: 500});
  }
}
