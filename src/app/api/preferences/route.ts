import {NextResponse} from "next/server";
import {z} from "zod";
import {getAuthenticatedClient} from "@/lib/supabase-server";

const schema = z.object({
  volume: z.union([z.literal(1), z.literal(2)]),
  dailyGoal: z.number().int().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  reviewResetHour: z.number().int().min(0).max(23),
  answerMode: z.enum(["kana", "kanji", "flexible"]),
});

function validTimezone(value: string) {
  try {new Intl.DateTimeFormat("en-US", {timeZone: value}); return true;}
  catch {return false;}
}

export async function GET() {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  try {
    const {data: saved, error} = await auth.client.from("user_preferences")
      .select("volume_id,daily_goal,timezone,review_reset_hour,answer_mode")
      .eq("user_id", auth.user.id).maybeSingle();
    if (error) throw error;
    let volume = 1;
    if (saved?.volume_id) {
      const {data: row, error: volumeError} = await auth.client.from("textbook_volumes")
        .select("volume_number").eq("id", saved.volume_id).single();
      if (volumeError) throw volumeError;
      volume = row.volume_number;
    }
    return NextResponse.json({volume, dailyGoal: saved?.daily_goal ?? 20,
      timezone: saved?.timezone ?? "Asia/Ho_Chi_Minh",
      reviewResetHour: saved?.review_reset_hour ?? 4,
      answerMode: saved?.answer_mode ?? "flexible"},
    {headers: {"Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "Không tải được cài đặt."}, {status: 500});
  }
}

export async function PUT(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validTimezone(parsed.data.timezone)) {
    return NextResponse.json({error: "Cài đặt không hợp lệ. Hãy kiểm tra múi giờ và các giá trị đã nhập."}, {status: 400});
  }
  try {
    const {data: edition, error: editionError} = await auth.client.from("textbook_editions")
      .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single();
    if (editionError) throw editionError;
    const {data: volume, error: volumeError} = await auth.client.from("textbook_volumes")
      .select("id").eq("edition_id", edition.id)
      .eq("volume_number", parsed.data.volume).single();
    if (volumeError) throw volumeError;
    const {error} = await auth.client.from("user_preferences").upsert({
      user_id: auth.user.id, edition_id: edition.id, volume_id: volume.id,
      daily_goal: parsed.data.dailyGoal, timezone: parsed.data.timezone,
      review_reset_hour: parsed.data.reviewResetHour, answer_mode: parsed.data.answerMode,
    }, {onConflict: "user_id"});
    if (error) throw error;
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({error: "Không lưu được cài đặt."}, {status: 500});
  }
}
