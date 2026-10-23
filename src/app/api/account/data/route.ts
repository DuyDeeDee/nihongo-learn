import {NextResponse} from "next/server";
import {getAuthenticatedClient, getTrustedClient} from "@/lib/supabase-server";

const confirmation = "XÓA DỮ LIỆU";

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) return NextResponse.json({error: "Vui lòng đăng nhập."}, {status: 401});
  const trusted = getTrustedClient();
  if (!trusted) return NextResponse.json({error: "Máy chủ chưa cấu hình khóa xóa dữ liệu."}, {status: 503});
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== confirmation) {
    return NextResponse.json({error: `Gõ chính xác “${confirmation}” để xác nhận.`}, {status: 400});
  }
  try {
    const {error} = await auth.client.rpc("delete_my_learning_data");
    if (error) throw error;
  } catch {
    return NextResponse.json({error: "Không xóa được dữ liệu học tập. Chưa thực hiện dọn tệp."}, {status: 500});
  }
  try {
    const bucket = trusted.storage.from("user-content");
    const paths: string[] = [];
    async function collect(prefix: string) {
      let offset = 0;
      while (true) {
        const {data, error} = await bucket.list(prefix, {limit: 1000, offset});
        if (error) throw error;
        for (const item of data ?? []) {
          const path = `${prefix}/${item.name}`;
          if (item.id) paths.push(path);
          else await collect(path);
        }
        if (!data || data.length < 1000) break;
        offset += data.length;
      }
    }
    await collect(auth.user.id);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const {error} = await bucket.remove(paths.slice(offset, offset + 100));
      if (error) throw error;
    }
    return NextResponse.json({deleted: true, removedFiles: paths.length});
  } catch {
    return NextResponse.json({error: "Dữ liệu bảng đã xóa, nhưng còn tệp trong Storage. Hãy thử xóa lại để dọn tệp."}, {status: 500});
  }
}
