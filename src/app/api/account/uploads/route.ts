import {NextResponse} from "next/server";
import {z} from "zod";
import {getAuthenticatedClient} from "@/lib/supabase-server";

const bucketName = "user-content";
const maxBytes = 10 * 1024 * 1024;
const types = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav",
} as const;
type MediaType = keyof typeof types;
const idSchema = z.string().uuid();

function allowedFile(bytes: Uint8Array, type: MediaType) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "audio/ogg") return String.fromCharCode(...bytes.slice(0, 4)) === "OggS";
  if (type === "audio/wav") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
  return String.fromCharCode(...bytes.slice(0, 3)) === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id !== null) {
      if (!idSchema.safeParse(id).success) return NextResponse.json({error: "Mã tệp không hợp lệ."}, {status: 400});
      const {data: row, error} = await auth.client.from("user_uploads")
        .select("object_path").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
      if (error) throw error;
      if (!row || !row.object_path.startsWith(`${auth.user.id}/`)) {
        return NextResponse.json({error: "Không tìm thấy tệp."}, {status: 404});
      }
      const {data, error: urlError} = await auth.client.storage.from(bucketName)
        .createSignedUrl(row.object_path, 60);
      if (urlError) throw urlError;
      return NextResponse.json({url: data.signedUrl}, {headers: {"Cache-Control": "no-store"}});
    }
    const {data, error} = await auth.client.from("user_uploads")
      .select("id,object_path,media_type,size_bytes,created_at")
      .eq("user_id", auth.user.id).order("created_at", {ascending: false}).limit(100);
    if (error) throw error;
    return NextResponse.json({files: data ?? []}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "Không tải được danh sách tệp."}, {status: 500});
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({error: "Chọn một tệp ảnh hoặc âm thanh."}, {status: 400});
  if (!(file.type in types) || file.size < 1 || file.size > maxBytes) {
    return NextResponse.json({error: "Chỉ nhận ảnh JPEG/PNG/WebP hoặc âm thanh MP3/Ogg/WAV, tối đa 10 MB."}, {status: 400});
  }
  const mediaType = file.type as MediaType;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!allowedFile(bytes, mediaType)) return NextResponse.json({error: "Nội dung tệp không khớp định dạng khai báo."}, {status: 400});
  const path = `${auth.user.id}/${crypto.randomUUID()}.${types[mediaType]}`;
  const bucket = auth.client.storage.from(bucketName);
  try {
    const {error: uploadError} = await bucket.upload(path, bytes, {contentType: mediaType, upsert: false});
    if (uploadError) throw uploadError;
    const {data, error} = await auth.client.from("user_uploads").insert({
      user_id: auth.user.id, bucket: bucketName, object_path: path,
      media_type: mediaType, size_bytes: bytes.length,
    }).select("id,object_path,media_type,size_bytes,created_at").single();
    if (error) {
      await bucket.remove([path]);
      throw error;
    }
    return NextResponse.json({file: data}, {status: 201});
  } catch {
    return NextResponse.json({error: "Không tải được tệp lên Storage."}, {status: 500});
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const parsed = z.object({id: idSchema}).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error: "Mã tệp không hợp lệ."}, {status: 400});
  try {
    const {data: row, error} = await auth.client.from("user_uploads")
      .select("object_path").eq("id", parsed.data.id).eq("user_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (!row || !row.object_path.startsWith(`${auth.user.id}/`)) {
      return NextResponse.json({error: "Không tìm thấy tệp."}, {status: 404});
    }
    const {error: storageError} = await auth.client.storage.from(bucketName).remove([row.object_path]);
    if (storageError) throw storageError;
    const {error: deleteError} = await auth.client.from("user_uploads")
      .delete().eq("id", parsed.data.id).eq("user_id", auth.user.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({deleted: true});
  } catch {
    return NextResponse.json({error: "Không xóa được tệp."}, {status: 500});
  }
}
