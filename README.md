# Nihongo Quest

Website tự học tiếng Nhật cá nhân theo lộ trình 50 bài Minna no Nihongo. UI tiếng Việt, responsive; demo mode chạy bằng mock data trước khi cấu hình Supabase. Nội dung sách có bản quyền không được đóng gói; lesson seed chỉ là metadata để bạn tự nhập học liệu có quyền sử dụng.

## Chạy ứng dụng

Cần Node.js 20.9+ và npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Mở http://localhost:3000. Để bật Supabase, tạo project, chạy `supabase/migrations/202610230001_initial_schema.sql`, rồi điền Project URL và anon/publishable key vào `.env.local`. Không bao giờ đưa `service_role` key vào `NEXT_PUBLIC_*` hoặc client.

## Tính năng

- Setup, dashboard, 50 bài theo Edition/Volume, lesson overview, vocabulary, grammar.
- Flashcards: Nhật → lật nghĩa → ẩn từ → gõ lại với Japanese IME (Kana/Kanji/Flexible) → chấm. Sai xếp Again; đúng chọn Hard/Good/Easy; retry lỗi trong phiên không tạo SRS review trùng.
- Quiz, Sentence Builder, Particle Master, review, mistakes, progress, settings.
- Supabase Auth/PostgreSQL/Storage schema với RLS; demo không yêu cầu tài khoản.

## Kiểm tra

`npm run typecheck`, `npm run lint`, `npm run build`.

## Tài liệu

- `docs/PROJECT_PLAN.md`
- `docs/UI_UX_SPEC.md`
- `docs/DATABASE_SPEC.md`

Đăng nhập email magic-link, callback, schema, RLS, Storage bucket riêng và RPC ghi điểm FSRS có sẵn khi cấu hình Supabase. Các CRUD API cho từ vựng/ngữ pháp/quiz/game và việc nối màn flashcard vào RPC chưa được bật trong MVP này. Phiên demo lưu trong bộ nhớ và reset khi reload; không cần Supabase để dùng luồng flashcard minh họa.
