import type {SupabaseClient} from "@supabase/supabase-js";
import {lessons} from "@/lib/data";

export async function resolveLessonId(client: SupabaseClient, key: string) {
  const lesson = lessons.find(entry => entry.id === key);
  if (!lesson) throw new Error("Bài học không hợp lệ.");
  const {data: edition, error: editionError} = await client.from("textbook_editions")
    .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single();
  if (editionError) throw editionError;
  const {data: volume, error: volumeError} = await client.from("textbook_volumes")
    .select("id").eq("edition_id", edition.id).eq("volume_number", lesson.volume).single();
  if (volumeError) throw volumeError;
  const {data: row, error: lessonError} = await client.from("lessons")
    .select("id").eq("volume_id", volume.id).eq("lesson_number", lesson.number)
    .eq("is_active", true).single();
  if (lessonError) throw lessonError;
  return row.id as string;
}
