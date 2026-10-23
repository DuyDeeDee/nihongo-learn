# Nihongo Quest

Website tự học tiếng Nhật cá nhân theo lộ trình 50 bài Minna no Nihongo. Giao diện tiếng Việt và dùng được trên điện thoại. Mỗi người tự nhập học liệu mình có quyền sử dụng; project chỉ seed metadata edition, volume và bài học.

## Chạy trên máy

Cần Node.js 20.9+ và npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Mở http://localhost:3000. Sau khi sửa `.env.local`, dừng server bằng `Ctrl+C` và chạy lại `npm run dev`.

Để bật lưu dữ liệu, điền URL, anon/publishable key và `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local`, liên kết Supabase CLI với project rồi chạy:

```powershell
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Lệnh này áp dụng toàn bộ migration chưa chạy trong `supabase/migrations/`. Khóa service role chỉ dùng trên Next.js server, không đưa vào `NEXT_PUBLIC_*`, mã client hoặc Git. `.env.local` đã nằm trong `.gitignore`.

## Tính năng hiện có

- 50 bài theo Edition 2, Volume I/II; danh sách lọc theo volume, trạng thái và số bài. Người học tự đánh dấu bài đang học/hoàn thành.
- Thêm/sửa/xóa từ vựng, ngữ pháp và câu hỏi Quiz/Games theo từng bài, riêng cho mỗi tài khoản bằng Supabase RLS.
- Flashcard tạo từ từ vựng cá nhân: lật nghĩa → ẩn từ Nhật → gõ lại → chấm. Lịch ôn FSRS và phiên học lưu vào Supabase; submit lặp và lượt luyện lại không chấm lịch hai lần.
- Quiz trắc nghiệm hoặc gõ đáp án; Sentence Builder và Particle Master dùng câu tự nhập. Đáp án được chấm trên server, lượt làm và điểm Quiz tốt nhất được lưu.
- Dashboard, Progress và danh sách lỗi lấy từ dữ liệu đã lưu. Luyện lại lỗi trên trang riêng không thay đổi lịch ôn.
- Setup/Settings lưu mục tiêu phút/ngày, volume, múi giờ, giờ đổi ngày và chế độ trả lời mặc định. Có xuất dữ liệu JSON và xóa dữ liệu học tập sau xác nhận.
- Settings cho tải lên, mở và xóa ảnh/âm thanh cá nhân trong Supabase Storage riêng tư. Server kiểm tra loại tệp và nội dung, tối đa 10 MB. Tệp hiện lưu độc lập, chưa gắn vào thẻ học.
- Chế độ demo không cần đăng nhập; kết quả luyện demo được làm mới khi tải lại. Lựa chọn Setup demo được lưu trên trình duyệt hiện tại.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run test:live` tạo hai tài khoản tạm trên Supabase đã cấu hình, kiểm tra RLS/FSRS rồi xóa chúng. `npm run test:api` tạo một tài khoản tạm, kiểm tra API Flashcard/Quiz/Games/Progress/Settings/Storage/xuất/xóa dữ liệu rồi xóa tài khoản đó. Trước khi chạy test API, chạy bản build bằng `npm run start -- -p 3105`, hoặc đặt `STUDY_SMOKE_APP_URL` tới server thử nghiệm.

## Triển khai khi push Git

GitHub chỉ lưu code; push không khởi động lại server đang chạy trên máy cá nhân. Với Vercel, import repository GitHub vào một project Vercel và chọn `main` làm nhánh production. Mỗi push lên nhánh đó sẽ tạo deployment mới theo [hướng dẫn Git deployments](https://vercel.com/docs/git).

Repository có GitHub Actions kiểm tra typecheck, lint, unit test và production build sau mỗi push hoặc pull request. Workflow này chỉ kiểm tra mã; việc đưa bản mới lên server phụ thuộc nền tảng triển khai được kết nối với repository.

Trong Vercel Project Settings → Environment Variables, thêm ba biến trong `.env.example` cho môi trường Production. Giữ `SUPABASE_SERVICE_ROLE_KEY` ở biến bí mật phía server. Trong Supabase Auth → URL Configuration, đặt Site URL là domain production và thêm `https://<domain>/auth/callback` vào Redirect URLs; giữ callback localhost cho phát triển cục bộ. Xem [Vercel environment variables](https://vercel.com/docs/environment-variables) và [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

Migration database không chạy theo Git push. Trước khi deploy code dùng migration mới, chạy `npx supabase db push --linked --dry-run` rồi `npx supabase db push --linked` với đúng project Supabase. Sau đó push code. Không đưa mật khẩu database hay service role key vào repository.

Nếu tự host với `next start`, sau khi pull code mới cần `npm ci`, `npm run build` và khởi động lại tiến trình theo trình quản lý server của bạn.

## Sao lưu và xóa dữ liệu

Settings có nút xuất JSON của riêng tài khoản. Bản JSON bao gồm dữ liệu trong các bảng ứng dụng nhưng **không chứa nội dung tệp trong Supabase Storage**; chưa có chức năng nhập lại JSON trực tiếp vào ứng dụng. Để sao lưu và khôi phục toàn bộ database, dùng [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) hoặc công cụ dump/restore theo gói dịch vụ. Supabase lưu ý backup database cũng không chứa nội dung tệp Storage; cần sao lưu tệp riêng. Hãy thử khôi phục trên project khác trước khi thao tác với dữ liệu đang dùng.

Settings có thao tác xóa toàn bộ dữ liệu học tập và tệp Storage thuộc tài khoản sau khi gõ xác nhận. Tài khoản đăng nhập vẫn được giữ để bắt đầu lại.

## Tài liệu

- `NIHONGO_QUEST_PROJECT_PLAN.md`
- `docs/PROJECT_PLAN.md`
- `docs/UI_UX_SPEC.md`
- `docs/DATABASE_SPEC.md`
