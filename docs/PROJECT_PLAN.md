# Nihongo Quest — Project Plan

## Tầm nhìn
Website tự học tiếng Nhật cá nhân theo hành trình 50 bài Minna no Nihongo, giao diện tiếng Việt. Bài học phân biệt theo edition và volume. Người học chủ động nhập nội dung mình có quyền sử dụng; ứng dụng không phân phối nội dung sách chưa được cấp phép.

## Mục tiêu và người dùng
- Người học cá nhân chọn đúng edition/volume, tự quản lý nhịp học và theo dõi tiến độ.
- Flashcard yêu cầu gõ lại tiếng Nhật bằng Japanese IME, không chỉ lật xem nghĩa.
- Dashboard cho biết bài tiếp theo, thẻ đến hạn, lỗi cần sửa và streak.
- Có thể dùng demo trước khi cấu hình tài khoản Supabase.

## MVP
Onboarding; dashboard; 50 lesson metadata; lesson overview; vocabulary; grammar; flashcards; quiz; Sentence Builder; Particle Master; review; review mistakes; progress; settings. Dữ liệu cá nhân lưu qua Supabase Auth/PostgreSQL/Storage khi người dùng cấu hình project riêng. Demo dùng mock data.

## Routes
`/setup`, `/dashboard`, `/lessons`, `/lessons/[lessonId]`, `/lessons/[lessonId]/vocabulary`, `/lessons/[lessonId]/grammar`, `/flashcards`, `/quiz`, `/games/sentence-builder`, `/games/particle-master`, `/review`, `/review/mistakes`, `/progress`, `/settings`.

## Kiến trúc
Next.js App Router + React + TypeScript; Tailwind CSS v4; UI primitives theo shadcn/ui; Lucide. Repository abstraction cho mock/Supabase. Supabase client dùng anon/publishable key và RLS, không dùng service role trong browser. Scheduler giữ trong domain/service; ghi version khi kết nối FSRS chính thức.

## Dữ liệu và quyền riêng tư
17 bảng PostgreSQL, owner-only RLS, catalog metadata theo edition/volume/lesson, bucket Storage private. Seed 50 lesson metadata cho một edition, phân bổ Bài 1–25 vào Volume I và Bài 26–50 vào Volume II; không seed nội dung từ vựng, câu, audio, hình, đáp án hay scan sách. Không đưa secret vào client. Người dùng tự nhập học liệu có quyền dùng.

## Flashcard/SRS rule
`SHOW_JAPANESE → REVEAL_MEANING → HIDE_PROMPT → TYPE_RECALL → RESULT → RATE_OR_RETRY → NEXT`. Kana chuẩn hóa Unicode/kana theo chế độ; Kanji không bỏ ký tự có nghĩa; Flexible khớp một accepted answer. Sai tự chọn Again, retry vào cuối phiên; lần retry không ghi review log hoặc cập nhật SRS trùng. Đúng bắt chọn Hard/Good/Easy. Grade canonical idempotent theo session-card; scheduler update cùng transaction với log.

## Lộ trình
1. Responsive shell, design tokens và demo repository.
2. Route MVP và flashcard recall workflow.
3. Migration 17 bảng, constraints, indexes, RLS, metadata seed.
4. Supabase auth, CRUD nội dung, Storage.
5. Persist review/quiz/game, xác minh FSRS và idempotency.
6. QA mobile/desktop, accessibility, backup/restore.

## Acceptance criteria
- Tất cả route hoạt động với demo.
- Flashcard buộc nhập; miss → Again; retry không nhân đôi SRS; correct chọn rating.
- Edition/volume không nhập nhằng; một edition có đủ 50 lesson metadata phân bổ qua các volume.
- Fresh migration tạo 17 bảng, indexes, RLS; RLS ngăn truy cập chéo user; bucket private.
- Không có nội dung sách có bản quyền trong seed.
- Build, typecheck, lint thành công; README có hướng dẫn setup.
