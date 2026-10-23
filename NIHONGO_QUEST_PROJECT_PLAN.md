# NIHONGO QUEST — KẾ HOẠCH TỔNG THỂ DỰ ÁN

> Website tự học tiếng Nhật cá nhân theo lộ trình 50 bài Minna no Nihongo. Tài liệu này là kế hoạch triển khai và tiêu chí nghiệm thu; trạng thái hiện tại được ghi riêng ở cuối tài liệu.

## 1. Mục tiêu và nguyên tắc sản phẩm

- Giúp một người học tự tổ chức lộ trình Minna no Nihongo, ôn từ vựng chủ động, luyện ngữ pháp và nhìn thấy tiến bộ theo thời gian.
- Giao diện tiếng Việt, dùng tốt trên điện thoại và máy tính; có bản demo để trải nghiệm trước khi kết nối tài khoản Supabase.
- Mỗi bài học gắn với **edition → volume → lesson**. Với edition mặc định, Volume I gồm bài 1–25 và Volume II gồm bài 26–50. Cùng số bài ở edition khác phải là bản ghi riêng.
- Người học tự nhập học liệu mình có quyền sử dụng. Ứng dụng chỉ tạo metadata của 50 bài, không đóng gói nội dung sách, bản scan, âm thanh, ảnh, đáp án hoặc câu ví dụ lấy từ sách khi chưa được cấp phép.
- Trọng tâm của Flashcard là **nhớ lại bằng cách gõ**, không tính một thẻ là đã học chỉ vì người dùng đã lật xem nghĩa.

### Người dùng và hành trình chính

1. Chọn edition/volume, mục tiêu học mỗi ngày, múi giờ và chế độ trả lời.
2. Mở bài học, thêm từ vựng/ngữ pháp cá nhân, rồi luyện Flashcard, Quiz hoặc Grammar Games.
3. Ôn thẻ đến hạn, luyện lại lỗi và theo dõi độ chính xác, tính đều đặn cùng tiến độ từng bài.
4. Có thể dùng demo không cần tài khoản; dữ liệu lưu lâu dài chỉ có khi kết nối Supabase và đăng nhập.

## 2. Phạm vi MVP

| Nhóm | Chức năng phải có |
| --- | --- |
| Thiết lập | Chọn edition/volume; mục tiêu/ngày; múi giờ và giờ đổi ngày; chế độ Kana, Kanji hoặc Flexible; vào demo nếu chưa đăng nhập. |
| Học liệu | Danh sách 50 bài; trang tổng quan bài; thêm/sửa/xóa từ vựng và ngữ pháp do người dùng nhập; trạng thái trống có hướng dẫn rõ. |
| Luyện tập | Flashcard có bước gõ lại bắt buộc; Quiz; Sentence Builder; Particle Master; ghi phản hồi đúng/sai. |
| Ôn tập | Hàng đợi thẻ đến hạn theo FSRS; danh sách lỗi; luyện lại lỗi trong phiên mà không tính hai lần lịch ôn. |
| Theo dõi | Dashboard, tiến độ bài, streak, mục tiêu, độ chính xác và phân bố trạng thái ôn tập. |
| Tài khoản/dữ liệu | Supabase Auth, PostgreSQL 17 bảng, RLS theo chủ sở hữu, Storage riêng tư; bản demo dùng dữ liệu mẫu tách biệt. |
| Chất lượng | Responsive, dùng được bằng bàn phím, thông báo cho công nghệ hỗ trợ, trạng thái loading/empty/error và kiểm tra bảo mật dữ liệu hai tài khoản. |

MVP ưu tiên hoàn thiện luồng học cá nhân. Nội dung chia sẻ cộng đồng, AI, thông báo đẩy và kho học liệu có bản quyền nằm ngoài MVP.

## 3. Trang và trải nghiệm UI/UX

| Route | Nội dung và tương tác chính |
| --- | --- |
| `/setup` | Hướng dẫn từng bước chọn edition/volume, mục tiêu, múi giờ, giờ đổi ngày và chế độ nhập; có lối vào demo. |
| `/dashboard` | Bài học tiếp theo, số thẻ đến hạn, streak, mục tiêu tuần, lỗi cần sửa và hoạt động gần đây; gắn nhãn demo khi dữ liệu chưa được lưu. |
| `/lessons` | 50 thẻ bài học, lọc edition → volume → trạng thái, tìm theo số bài. |
| `/lessons/[lessonId]` | Mục tiêu bài, số mục đã nhập, tiến độ và liên kết đến từ vựng, ngữ pháp, Quiz, Games. |
| `/lessons/[lessonId]/vocabulary` | Danh sách và form từ Nhật, kana, nghĩa, loại từ, ví dụ, ghi chú nguồn; tạo Flashcard từ mục hợp lệ. |
| `/lessons/[lessonId]/grammar` | Mẫu ngữ pháp, giải thích, ví dụ tự nhập, sắp thứ tự và chỉnh sửa. |
| `/flashcards` | Phiên thẻ theo bài hoặc hàng đợi ôn; hiển thị tiến độ, chế độ trả lời, trạng thái gõ và kết quả. |
| `/quiz` | Câu hỏi tự biên, tiến độ, chấm sau khi nộp, giải thích và trang tổng kết. |
| `/games/sentence-builder` | Sắp xếp token thành câu; có chọn, bỏ, reset, kiểm tra và gợi ý phù hợp. |
| `/games/particle-master` | Điền/chọn trợ từ; phản hồi ngay, giải thích ngắn và điểm/streak nhẹ. |
| `/review`, `/review/mistakes` | Thẻ đến hạn; nhóm lỗi theo bài/từ, xem đáp án đã nhập và bắt đầu luyện lại. |
| `/progress` | Mức độ đều đặn, độ chính xác, số bài hoàn tất, phân bố SRS, lọc theo edition/volume; giải thích cách tính. |
| `/settings` | Hồ sơ, mục tiêu, edition/volume, chế độ trả lời, múi giờ, xuất/xóa dữ liệu và trạng thái kết nối Supabase. |

### Hệ thiết kế và khả năng tiếp cận

- Phong cách **Japanese Minimalism × Cozy Gamification**: nền kem `#F7F4ED`, surface `#FFFEFA`, mực than `#282923`, đỏ vermilion `#D65B45`, xanh matcha `#71866A`; khoảng thở rộng, card bo mềm, hiệu ứng tiết chế.
- Desktop có sidebar và topbar; tablet thu gọn; mobile dùng header và bottom navigation, bố cục một cột, thao tác chính dễ chạm.
- Chữ Việt dễ đọc, font dự phòng phù hợp tiếng Nhật; vùng chạm tối thiểu 44 × 44 px, focus rõ, hỗ trợ bàn phím, `aria-live` cho kết quả, giảm chuyển động khi hệ thống yêu cầu, tương phản hướng đến WCAG AA.
- Mỗi màn có trạng thái đang tải, chưa có dữ liệu, lỗi/mất kết nối và thành công. Cảnh báo khi rời phiên học dở.

## 4. Flashcard: lật thẻ rồi bắt buộc gõ lại

Luồng bắt buộc cho **mỗi** thẻ:

```text
SHOW_JAPANESE → REVEAL_MEANING → HIDE_PROMPT → TYPE_RECALL
              → RESULT → RATE_OR_RETRY → NEXT
```

1. Hiện từ tiếng Nhật để người học tự đọc/nhớ; nhấn **Hiện nghĩa** mới được xem nghĩa.
2. Sau khi xem nghĩa, nhấn **Ẩn từ Nhật và kiểm tra**. Ẩn cả từ gốc trước khi mở ô nhập.
3. Người học dùng Japanese IME và gõ lại từ. Không cho bỏ qua bước nhập hoặc nộp đáp án rỗng; Enter trong lúc IME đang composition không nộp form.
4. So khớp theo chế độ: **Kana** chấp nhận cách viết kana đã cấu hình; **Kanji** yêu cầu cách viết có kanji; **Flexible** chấp nhận một trong các đáp án hợp lệ do người học khai báo. Chuẩn hóa Unicode NFKC và khoảng trắng, xử lý kana đúng chế độ, không loại bỏ ký tự kanji có nghĩa.
5. Nếu sai: hiện đáp án, ghi **Again** cho lần chấm chính, đưa thẻ về cuối phiên để gõ lại. Lượt retry chỉ là luyện thêm; không tạo review log hay cập nhật FSRS lần hai.
6. Nếu đúng ở lượt chấm chính: bắt chọn **Hard / Good / Easy** rồi mới chuyển thẻ. Lượt retry đúng cho phép đi tiếp mà không chấm SRS thêm.

Một `session_card_id` chỉ có một lần chấm chính. Lưu `attempt_index`, đáp án đã gõ, kết quả, rating và cờ `graded_once`. Người học phải nhìn thấy rõ trạng thái đã lưu hay chưa; không tính demo là dữ liệu đã đồng bộ.

## 5. Quiz và Grammar Games

### Quiz

- Dùng câu hỏi theo bài do người dùng tự tạo: trắc nghiệm, gõ đáp án, sắp xếp hoặc điền trợ từ khi dữ liệu phù hợp.
- Hiển thị số câu, trạng thái câu hiện tại; chỉ chấm sau khi nộp. Sau khi nộp, giải thích đáp án và cho xem tổng kết điểm/độ chính xác.
- Lưu từng `quiz_attempts` và cập nhật điểm tốt nhất của bài khi dùng chế độ có tài khoản; demo ghi trong bộ nhớ và nêu rõ sẽ mất khi tải lại.
- Không dùng câu hỏi ví dụ như thể đó là nội dung nguyên bản của Minna no Nihongo.

### Grammar Games

- **Sentence Builder:** người học sắp token thành câu, có reset, gợi ý, kiểm tra kết quả và khả năng sửa trước khi chấm.
- **Particle Master:** chọn/nhập trợ từ phù hợp, phản hồi ngay kèm giải thích ngắn; có điểm và streak nhẹ.
- Ghi `game_attempts` theo người dùng, bài, loại game, kết quả, điểm và thời gian. Nội dung trò chơi do người dùng nhập hoặc tự biên hợp pháp.

## 6. FSRS và quy tắc ôn tập

- Dùng `ts-fsrs` cho thuật toán FSRS; tách scheduler khỏi UI. Lưu `fsrs_state`, `scheduler_version`, `due_at`, stability, difficulty, số lần ôn và số lần quên trên `flashcards`.
- Thời điểm đến hạn lưu UTC; cách nhóm “hôm nay” theo `timezone` và `review_reset_hour` của người học. Bỏ qua thẻ bị tạm dừng.
- Chỉ một chấm điểm chính cho mỗi thẻ trong phiên. Ghi `review_logs`, cập nhật thẻ và đánh dấu `session_cards.graded_once` trong **cùng một giao dịch**; gọi lại cùng `session_card_id` trả kết quả cũ, không tăng lịch ôn lần nữa.
- Sai tương ứng Again; đúng mới chọn Hard/Good/Easy. Không cho client tự quyết định `due_at` hoặc trạng thái FSRS trong luồng lưu thật: máy chủ/RPC phải tính hoặc xác minh kết quả theo phiên bản scheduler và trạng thái hiện tại trước khi ghi.
- Kiểm thử riêng các tình huống: submit lặp, mất mạng rồi gửi lại, refresh giữa phiên, nhiều tab, đổi múi giờ, thẻ mới, thẻ đã học và lượt retry sau câu sai.

## 7. PostgreSQL / Supabase: 17 bảng

UUID cho khóa chính, `timestamptz` cho thời gian, ràng buộc và chỉ mục cho truy vấn thường dùng. Catalog chỉ chứa metadata; dữ liệu học cá nhân thuộc riêng từng người dùng.

| # | Bảng | Vai trò |
| ---: | --- | --- |
| 1 | `profiles` | Hồ sơ liên kết `auth.users`. |
| 2 | `user_preferences` | Edition/volume, mục tiêu, múi giờ, giờ đổi ngày, chế độ trả lời. |
| 3 | `textbook_editions` | Metadata từng edition. |
| 4 | `textbook_volumes` | Volume thuộc edition. |
| 5 | `lessons` | 50 vị trí bài học theo volume. |
| 6 | `user_lesson_progress` | Trạng thái và chỉ số hoàn thành bài của người học. |
| 7 | `vocabulary_items` | Từ vựng cá nhân theo bài. |
| 8 | `grammar_items` | Mẫu ngữ pháp cá nhân theo bài. |
| 9 | `flashcards` | Nội dung thẻ, đáp án hợp lệ và trạng thái FSRS. |
| 10 | `study_sessions` | Phiên Flashcard, Quiz, Review hoặc Game. |
| 11 | `session_cards` | Một thẻ trong phiên, lần thử và cờ chấm chính. |
| 12 | `review_logs` | Nhật ký chấm SRS bất biến, duy nhất theo `session_card_id`. |
| 13 | `quiz_questions` | Ngân hàng câu hỏi cá nhân. |
| 14 | `quiz_attempts` | Từng lần trả lời Quiz. |
| 15 | `game_attempts` | Lượt chơi và kết quả Grammar Games. |
| 16 | `achievements` | Huy hiệu/thành tựu cá nhân. |
| 17 | `user_uploads` | Metadata của tệp người dùng tải lên. |

### Quy tắc dữ liệu và bảo mật

- Bật RLS trên đủ 17 bảng. Bảng cá nhân chỉ cho chủ sở hữu đọc/ghi; `session_cards` phải kiểm tra chủ của phiên **và** thẻ; `review_logs` chỉ đọc trực tiếp, thao tác chấm đi qua RPC đáng tin cậy.
- Metadata edition/volume/lesson chỉ đọc cho tài khoản hợp lệ; ghi bằng migration/quy trình quản trị. Cần kiểm tra `volume_id` thuộc `edition_id` đã chọn và lesson đúng volume.
- Chỉ mục tối thiểu: `(user_id, due_at)` cho thẻ chưa tạm dừng; `(user_id, lesson_id)` cho học liệu; `(user_id, started_at)` cho phiên; `(user_id, reviewed_at)` cho log; khóa duy nhất cho tiến độ từng bài và review của `session_card_id`.
- Storage bucket `user-content` ở chế độ private; đường dẫn bắt đầu bằng `<auth.uid()>/`; giới hạn loại tệp và dung lượng ở cả Storage lẫn endpoint upload.
- Không đặt service-role key trong browser hoặc biến `NEXT_PUBLIC_*`. Client dùng anon/publishable key và RLS; bí mật nằm phía máy chủ.
- Seed một edition mặc định với 2 volume và 50 lesson metadata; **không** seed từ vựng, ngữ pháp, câu, audio, ảnh hoặc lời giải của sách.
- Kiểm tra migration trên database mới, kể cả giới hạn trường, quan hệ, RLS, Storage và tác vụ chấm lặp.

## 8. Kiến trúc Next.js và cấu trúc thư mục

**Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS v4, UI primitives theo shadcn/ui và Lucide. **Backend dữ liệu:** Supabase Auth, PostgreSQL, Storage. Giao diện gọi qua lớp repository/service để chuyển giữa demo và dữ liệu thật; không đặt logic chấm hay lịch ôn trong component.

```text
D:\JAPANLEARN\
├─ docs/                         # Đặc tả chi tiết và quyết định sản phẩm
├─ src/
│  ├─ app/                       # Routes, layout, API route handlers
│  │  ├─ setup/ dashboard/ lessons/ flashcards/ quiz/
│  │  ├─ games/ review/ progress/ settings/
│  │  └─ auth/callback/
│  ├─ components/                # App shell, màn hình và UI primitives
│  ├─ features/                  # Theo tính năng: lessons, cards, quiz, games, review
│  ├─ lib/                       # Supabase client/server, chuẩn hóa đáp án, FSRS
│  ├─ repositories/              # Giao diện dữ liệu + demo/Supabase adapters
│  └─ types/                     # Kiểu dữ liệu domain và API
├─ supabase/
│  ├─ migrations/                # Schema, RLS, Storage, RPC
│  └─ seed/                      # Chỉ metadata được phép sử dụng
├─ public/                       # Asset tự tạo hoặc có quyền dùng
├─ .env.example                  # Mẫu cấu hình, không chứa secret thật
└─ NIHONGO_QUEST_PROJECT_PLAN.md # Tài liệu kế hoạch tổng thể
```

Cây trên là **cấu trúc đích**. Project hiện tại đã có `src/app`, `src/components`, `src/lib` và migration; các thư mục `features`, `repositories`, `types` được thêm dần khi tách demo khỏi luồng dữ liệu thật. Route handler/server action xác thực phiên, kiểm tra quyền sở hữu và input; RPC đảm nhiệm cập nhật SRS nguyên tử.

## 9. Thứ tự triển khai

| Giai đoạn | Việc thực hiện | Điều kiện chuyển bước |
| --- | --- | --- |
| 1. Nền tảng | Design tokens, responsive app shell, điều hướng, demo repository, loading/empty/error state. | Các route MVP mở được; desktop/mobile dùng được. |
| 2. Học liệu và Flashcard | Lesson theo edition/volume, CRUD từ vựng/ngữ pháp, luồng lật → ẩn → gõ → chấm, chuẩn hóa đáp án. | Không thể bỏ qua ô gõ; sai/đúng đi đúng nhánh. |
| 3. Dữ liệu và Auth | Migration 17 bảng, seed metadata, index/RLS/Storage, đăng nhập, repository Supabase. | Hai tài khoản không nhìn/sửa dữ liệu của nhau; demo vẫn hoạt động riêng. |
| 4. Ôn tập FSRS | Phiên học, hàng đợi đến hạn, RPC chấm nguyên tử/idempotent, lỗi cần luyện. | Submit lặp và retry không tạo review trùng. |
| 5. Quiz và Games | Ngân hàng câu hỏi cá nhân, kết quả Quiz, Sentence Builder, Particle Master, lưu attempts. | Chấm/giải thích/lưu kết quả đúng; không phụ thuộc nội dung sách chưa được cấp phép. |
| 6. Tiến độ và hoàn thiện | Dashboard thật, thống kê, export/delete, accessibility, mobile QA, backup/restore và tài liệu vận hành. | Toàn bộ acceptance criteria bên dưới đạt. |

Ưu tiên xử lý các khoảng trống hiện tại trước khi coi MVP hoàn tất: nối Flashcard với RPC/FSRS có lưu thật; hoàn thiện CRUD ngữ pháp/Quiz/Games; đồng bộ Dashboard/Review/Progress từ dữ liệu Supabase; kiểm chứng RLS và luồng hai tài khoản.

## 10. Acceptance criteria / định nghĩa hoàn tất MVP

1. **Điều hướng:** tất cả trang ở mục 3 mở được, có loading/empty/error state; demo hoạt động khi chưa cấu hình Supabase.
2. **Dữ liệu bài học:** edition mặc định có đúng 50 lesson metadata, bài 1–25 ở Volume I và 26–50 ở Volume II; filter và tiến độ không trộn edition hoặc volume.
3. **Nhập học liệu:** người học tạo, sửa, xóa học liệu của mình; tài khoản khác không đọc hoặc sửa được; không có nội dung sách có bản quyền trong seed/asset.
4. **Flashcard:** luôn đi qua lật nghĩa → ẩn từ → gõ lại → chấm; không nộp rỗng hoặc trong IME composition; đáp án Kana/Kanji/Flexible được so khớp đúng.
5. **Chấm và ôn:** sai ghi Again một lần và quay lại cuối phiên; đúng bắt chọn Hard/Good/Easy; retry và request lặp không tạo log hoặc cập nhật lịch ôn trùng.
6. **FSRS:** thẻ đến hạn đúng theo `due_at`, múi giờ/giờ đổi ngày và trạng thái tạm dừng; version scheduler được lưu; lịch ôn không được nhận mù quáng từ client.
7. **Quiz/Games:** có phản hồi và giải thích; mỗi attempt của chế độ đăng nhập được lưu đúng người/bài/phiên; tổng kết phản ánh dữ liệu đã chấm.
8. **Database:** migration sạch tạo đúng 17 bảng domain, constraints, indexes, RLS, bucket riêng tư và RPC; thử truy cập chéo hai tài khoản đều bị từ chối.
9. **Trải nghiệm:** dùng được ở kích thước mobile/desktop, bằng bàn phím và trình đọc màn hình cho các thao tác chính; người dùng thấy rõ demo chưa lưu bền vững.
10. **Kỹ thuật/vận hành:** typecheck, lint và build đạt; README hướng dẫn cấu hình, migration, chạy thử, backup/restore và không lộ secret.

## 11. Phần mở rộng sau MVP

- Tạo kế hoạch học linh hoạt theo lịch cá nhân, nhiều mục tiêu và nhắc ôn khi người học chủ động bật.
- Thêm audio phát âm, thu âm và luyện nghe/nói bằng nội dung tự tạo hoặc có giấy phép.
- Thêm game ngữ pháp khác, thử thách theo tuần, huy hiệu có ý nghĩa và thống kê sâu theo kỹ năng.
- Nhập/xuất dữ liệu theo định dạng mở, hỗ trợ nhiều thiết bị và đồng bộ ngoại tuyến khi có thiết kế xử lý xung đột.
- Kho nội dung cộng đồng có kiểm duyệt và quản lý bản quyền; AI hỗ trợ giải thích/chấm câu chỉ sau khi có quy tắc bảo vệ dữ liệu và kiểm tra chất lượng.
- Hỗ trợ thêm edition, sách hoặc lộ trình JLPT mà không làm lẫn dữ liệu bài hiện có.

## 12. Trạng thái project khi lập kế hoạch

Tại `D:\JAPANLEARN` đã có ứng dụng Next.js, các route và màn demo chính, tài liệu UI/UX và database, migration 17 bảng, Auth callback, Supabase client, CRUD từ vựng và ví dụ Flashcard dùng `ts-fsrs` trong bộ nhớ. Theo README và mã hiện có, demo reset khi tải lại; màn Flashcard chưa ghi qua RPC vào Supabase, còn CRUD ngữ pháp/Quiz/Games và thống kê lưu thật cần hoàn thiện. Vì vậy các mục trên là **đích nghiệm thu**, không phải xác nhận rằng toàn bộ MVP đã xong.

**Tài liệu nguồn trong project:** `docs/PROJECT_PLAN.md`, `docs/UI_UX_SPEC.md`, `docs/DATABASE_SPEC.md`, `README.md` và `supabase/migrations/202610230001_initial_schema.sql`.

## 13. Cập nhật triển khai ngày 24/10/2026

Các giai đoạn 1–5 đã có luồng hoạt động trên Supabase: 50 bài và lọc theo volume/trạng thái; CRUD từ vựng, ngữ pháp và câu hỏi theo bài; Flashcard có phiên học, FSRS và chấm lặp an toàn; Quiz trắc nghiệm/gõ đáp án và hai game; Dashboard, Progress, luyện lỗi; Setup/Settings; xuất JSON, xóa dữ liệu và quản lý ảnh/âm thanh cá nhân. Chế độ demo vẫn hoạt động khi chưa đăng nhập. Migration 001–007 đã áp dụng lên Supabase được liên kết.

Kiểm chứng đã thực hiện: typecheck, ESLint, unit tests, production build, smoke API bằng tài khoản tạm, RLS với hai tài khoản và kiểm tra các route qua HTTP. Các tài khoản và dữ liệu thử được dọn sau kiểm tra. Tệp `.env.local` không nằm trong Git.

**Việc còn lại trước khi xác nhận MVP hoàn tất:** kiểm tra trực quan và thao tác bàn phím/trình đọc màn hình trên trình duyệt desktop/mobile; thử toàn bộ migration trên database mới; kết nối repository với một dịch vụ triển khai (ví dụ Vercel), cấu hình biến môi trường/domain/Auth redirect rồi kiểm tra một lần push tạo bản deploy mới. Chức năng nhập lại JSON và sao lưu nội dung Storage chưa có trong ứng dụng; tài liệu vận hành nêu cách dùng công cụ backup của Supabase và giới hạn của bản xuất JSON. Ảnh/âm thanh cá nhân hiện chưa gắn vào thẻ học.
