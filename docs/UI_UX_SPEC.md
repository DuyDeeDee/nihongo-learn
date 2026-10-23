# Nihongo Quest — UI / UX Specification

## Hướng thiết kế
Japanese Minimalism × Cozy Gamification: nền kem/washi `#F7F4ED`, surface ấm `#FFFEFA`, mực than `#282923`, muted `#77786F`, vermilion `#D65B45`, matcha `#71866A`, border `#E9E4D9`. Khoảng thở rộng, card bo 16–20 px, bóng nhẹ. Gamification chỉ dùng streak/progress/badges nhỏ.

## Typography, layout, accessibility
Sans dễ đọc tiếng Việt; fallback hệ thống cho Japanese, tùy chọn self-host Noto Sans JP có quyền sử dụng. Spacing 4/8 px, content tối đa khoảng 1200 px. Desktop sidebar + topbar; tablet thu gọn; mobile header/bottom nav, một cột, CTA dễ chạm. Keyboard focus, reduced motion, vùng touch ≥44×44 px, contrast hướng WCAG AA, live region tiếng Việt.

## Navigation
Sidebar: Tổng quan, Bài học, Flashcard, Ôn tập, Tiến độ, Cài đặt. Lesson pages có breadcrumb. Setup truy cập lại từ Settings.

## Màn hình
- **Setup**: stepper chọn edition/volume, mục tiêu/ngày + timezone/reset hour, chế độ Kana/Kanji/Flexible; cho skip vào demo.
- **Dashboard**: streak, mục tiêu tuần, học tiếp, due count, tổng tiến độ, hoạt động đã lưu; demo có nhãn rõ.
- **Lessons**: 50 cards, filter Edition → Volume → trạng thái, tìm số bài; cùng số bài ở edition khác là item riêng.
- **Lesson overview**: mục tiêu, số mục đã nhập, liên kết vocabulary/grammar/quiz/games, empty state khi chưa có nội dung.
- **Vocabulary/Grammar**: Japanese, kana, meaning, POS, ví dụ do người học nhập; mẫu, giải thích, ví dụ; không seed trích sách.
- **Flashcards**: progress phiên, mode selector, progress bar, thoát phiên.
- **Quiz**: câu hỏi tự biên, tiến độ, giải thích sau submit, tổng kết.
- **Sentence Builder**: sắp token, reset/hint/check.
- **Particle Master**: trả lời trợ từ, feedback ngay, streak nhẹ.
- **Review**: số thẻ đến hạn và bắt đầu; **Mistakes**: nhóm theo lesson, từ, đáp án sai, luyện lại.
- **Progress**: consistency, accuracy, bài hoàn tất, SRS distribution, theo edition/volume, metric explanations.
- **Settings**: auth/profile, edition/volume, goal, mode, timezone, export/delete, trạng thái Supabase; không show secret.

## Flashcard interaction bắt buộc
State: `SHOW_JAPANESE → REVEAL_MEANING → HIDE_PROMPT → TYPE_RECALL → RESULT → RATE_OR_RETRY → NEXT`.
1. Hiện từ Nhật, người học chọn “Hiện nghĩa”.
2. Hiện nghĩa, chọn “Ẩn từ Nhật và kiểm tra”.
3. Chỉ sau đó hiện input + hướng dẫn Japanese IME và Kana/Kanji/Flexible.
4. Submit mới chấm; Enter không được bỏ state; không submit trong IME composition.
5. Sai: show đáp án + Again, đẩy retry về cuối phiên. Đúng: bắt chọn Hard/Good/Easy.
6. Track `session_card_id`, `attempt_index`, `graded_once`; retry không tạo SRS log thứ hai.

## States
Loading/skeleton, empty, offline/error, success; input label, focus rõ, keyboard-only operation, aria-live result, reduced motion. Cảnh báo trước khi thoát phiên đang học.

## Bản quyền
Không đóng gói scan, câu, từ, audio, hình hoặc lời giải sách. Empty state ghi rõ người học tự thêm nội dung hợp pháp.
