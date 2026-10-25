# Nihongo Quest — Kế hoạch thiết kế lại UI/UX

Ngày lập: 25/10/2026  
Trạng thái: Đề xuất để duyệt trước khi sửa giao diện

## 1. Mục tiêu

Website chủ yếu phục vụ một người tự học tiếng Nhật. Khi mở ứng dụng, người học cần thấy ngay **việc nên làm tiếp theo**: ôn thẻ đến hạn, học tiếp bài đang dở hoặc thêm học liệu vào bài. Giao diện mới phải ít lựa chọn gây phân tâm, dễ đọc tiếng Việt và tiếng Nhật, và dùng thoải mái trên điện thoại lẫn máy tính.

Thiết kế lại giao diện, cách tổ chức thông tin và luồng thao tác. Giữ nguyên dữ liệu Supabase, các URL đang dùng, quyền truy cập, logic chấm Flashcard/FSRS, Quiz và Games, trừ khi một thay đổi chức năng được duyệt riêng.

## 2. Những gì đã quan sát

Đã xem mã giao diện, đặc tả `docs/UI_UX_SPEC.md` và bản demo công khai ở `/dashboard`, `/lessons`, `/flashcards`. Chưa xem tài khoản có dữ liệu thật; cần kiểm tra các màn đã đăng nhập trước khi chốt bản vẽ chi tiết.

| Khu vực hiện tại | Vấn đề trải nghiệm | Hướng xử lý |
| --- | --- | --- |
| Điều hướng | Sidebar có sáu mục, topbar lặp thương hiệu, thẻ “Mục tiêu học” ở cuối sidebar dẫn lại Dashboard; mobile có sáu mục dưới cùng. | Bốn mục chính: Hôm nay, Bài học, Ôn tập, Tiến độ. Đưa Cài đặt vào menu tài khoản; Flashcard mở từ bài học hoặc Ôn tập. Giữ URL cũ để liên kết không hỏng. |
| Dashboard | Ba thẻ số liệu có trọng số ngang nhau; bản demo đặt biểu mẫu đăng nhập lớn ở giữa hành trình. | Một khối “Việc hôm nay” với CTA duy nhất theo ngữ cảnh; số liệu và đăng nhập chuyển thành phần phụ. |
| Danh sách bài | 50 thẻ ba cột gần như giống nhau, cần cuộn lâu để tìm bài. | Nhóm theo Volume, ghim bài đang học/tiếp theo, danh sách hàng gọn có tìm kiếm và trạng thái. |
| Trang bài | Từ vựng, ngữ pháp, Flashcard, Quiz và hai game cùng xuất hiện như các lựa chọn ngang nhau. | Trình tự rõ: Chuẩn bị học liệu → Học → Luyện → Ôn; nhấn mạnh một bước tiếp theo, các hoạt động khác vẫn truy cập được. |
| Từ vựng | Biểu mẫu hiển thị bảy trường cùng lúc; mỗi từ là một thẻ lớn có nhiều thao tác. | Form nhanh với từ Nhật, cách đọc, nghĩa; ví dụ/loại từ/nguồn ở phần mở rộng. Danh sách gọn, hành động Sửa/Xóa dễ thấy nhưng không lấn nội dung. |
| Flashcard và Quiz | Luồng học đã có nhiều trạng thái quan trọng, nhưng phần bao quanh còn dùng các card và nút chung. | Chế độ tập trung: một câu hỏi/thẻ mỗi màn, tiến độ và thoát phiên rõ, phản hồi đúng/sai dễ hiểu. Không rút ngắn các bước nhớ lại bắt buộc. |

## 3. Nguyên tắc giao diện mới

1. **Một hành động chính mỗi màn.** Nút nổi bật dẫn tới bước có ích nhất ở thời điểm đó; lựa chọn phụ vẫn có nhưng giảm nhấn mạnh.
2. **Học liệu đứng trước trang trí.** Chữ Nhật, furigana, nghĩa và đáp án cần dễ đọc; tránh bóng đổ, viền và nhãn lặp không mang thông tin.
3. **Ưu tiên việc học cá nhân.** Sau đăng nhập đi thẳng tới tiến độ thật. Demo và đăng nhập có lối vào rõ nhưng không chiếm trang học của người đã có tài khoản.
4. **Giữ ngữ cảnh.** Từ một bài có thể thêm từ, thêm ngữ pháp và bắt đầu luyện chính bài đó; quay lại không mất vị trí hoặc bộ lọc.
5. **Trạng thái minh bạch.** Phân biệt rõ demo, đang tải, chưa có dữ liệu, đang lưu, đã lưu, lỗi và mất kết nối.
6. **Dễ tiếp cận.** Tương phản đạt WCAG AA, vùng chạm ít nhất 44 × 44 px, điều hướng bàn phím, focus rõ, nhãn cho trình đọc màn hình, hỗ trợ IME tiếng Nhật và giảm chuyển động.

## 4. Cấu trúc điều hướng đề xuất

```text
Hôm nay (/dashboard)
├─ Ôn thẻ đến hạn → /review → /flashcards
└─ Học tiếp → /lessons/[lessonId]

Bài học (/lessons)
└─ Một bài → Từ vựng | Ngữ pháp | Quiz | Games

Ôn tập (/review)
└─ Thẻ đến hạn | Luyện lỗi

Tiến độ (/progress)

Menu tài khoản → Cài đặt (/settings), thiết lập (/setup), đăng nhập/đăng xuất
```

Trên điện thoại, thanh dưới chỉ chứa bốn mục chính. Trên máy tính, sidebar cũng dùng cùng bốn mục; menu tài khoản nằm ở góc trên. Các route hiện có vẫn hoạt động.

## 5. Thiết kế theo màn

### 5.1 Hôm nay / Dashboard — ưu tiên cao nhất

- Phần đầu: lời chào ngắn và một thẻ “Việc hôm nay”. Nếu có thẻ đến hạn, CTA là “Ôn N thẻ”; nếu không, CTA là “Học tiếp bài X”; nếu chưa có học liệu, CTA là “Bắt đầu bài 1”.
- Bên dưới: mục tiêu hôm nay, chuỗi học và tiến độ lộ trình ở dạng nhỏ gọn; số liệu giải thích được và chỉ dùng dữ liệu thật khi đã đăng nhập.
- Với khách: một thông điệp ngắn về demo và nút Đăng nhập/Thử demo; biểu mẫu đăng nhập ở màn hoặc hộp thoại riêng.
- Bỏ thẻ sidebar lặp “Mở tổng quan”.

### 5.2 Bài học và trang bài

- Danh sách 50 bài: hai nhóm Volume I/II, mỗi hàng hiển thị số bài, trạng thái, số từ/ngữ pháp và dấu tiến độ. Ghim “Đang học”/“Tiếp theo” lên đầu. Tìm bài và lọc vẫn có nhưng gọn hơn.
- Trang bài: tiêu đề và trạng thái ở trên; ba phần theo thứ tự “Học liệu”, “Luyện tập”, “Kết quả”. Một CTA chính thay đổi theo dữ liệu bài. Các game nằm trong nhóm Luyện tập, không phải bốn nút lớn cùng cấp.
- Giữ nguyên quan hệ edition → volume → lesson và các khóa dữ liệu hiện tại.

### 5.3 Từ vựng và ngữ pháp

- Nút “Thêm từ”/“Thêm mẫu” mở form tập trung. Trường cốt lõi hiện trước; trường bổ sung nằm trong “Thêm chi tiết”. Có nhãn bắt buộc, ví dụ nhập hợp lệ, phản hồi lưu rõ ràng.
- Danh sách ưu tiên chữ Nhật và nghĩa; thông tin bổ sung mở rộng khi cần. Trên máy tính có thể dùng hàng gọn; trên điện thoại dùng thẻ một cột.
- Sửa dùng cùng form; xóa có xác nhận nêu rõ từ/bài sẽ bị xóa. Sau lưu quay lại đúng danh sách, không mất bộ lọc.
- Empty state chỉ dẫn bước đầu tiên, không đưa hướng dẫn kỹ thuật như `.env.local` vào giao diện người học.

### 5.4 Flashcard, Quiz và Games

- Flashcard dùng khung học tập ít thành phần: tiến độ phiên, từ/câu hỏi, một nút hành động theo trạng thái, phản hồi và chọn Hard/Good/Easy sau khi trả lời đúng.
- Giữ nguyên chuỗi **hiện từ → hiện nghĩa → ẩn từ → gõ lại → chấm → chọn mức/ôn lại**; không bỏ qua IME hoặc thay đổi cách ghi FSRS.
- Quiz và Games cùng hệ nút, phản hồi và màn tổng kết; nhấn mạnh đáp án, giải thích và “Luyện tiếp” hơn điểm số trang trí.
- Cảnh báo khi rời phiên chưa hoàn tất; kết quả đã lưu và lượt demo phải phân biệt rõ.

### 5.5 Tiến độ và Cài đặt

- Tiến độ: 2–3 chỉ số có ích nhất ở đầu trang, biểu đồ/nhóm thẻ ôn có chú giải ngắn, danh sách bài dùng hàng gọn thay vì thêm 50 card.
- Cài đặt: nhóm “Học tập”, “Tài khoản”, “Dữ liệu”; thao tác xuất/xóa ở cuối với cảnh báo phù hợp.

## 6. Ngôn ngữ thị giác

Giữ tinh thần Nhật tối giản và tông ấm đang có, nhưng giảm số card, giảm bóng đổ và màu nhấn. Dùng một màu hành động chính; xanh chỉ cho trạng thái thành công/tiến độ. Hệ chữ có cấp bậc rõ: tiêu đề trang, tiêu đề phần, nội dung học, chú thích. Chữ Nhật có font và khoảng dòng riêng; furigana không chen vào dòng tiếng Việt. Dùng khoảng trắng để phân nhóm thay vì viền quanh mọi phần.

Trước khi triển khai cần chốt mẫu màu/chữ và hai bản vẽ tham chiếu: Dashboard và trang Bài học, ở cả điện thoại lẫn máy tính.

## 7. Các giai đoạn thực hiện

| Giai đoạn | Công việc | Đầu ra để duyệt |
| --- | --- | --- |
| 0. Kiểm tra luồng thật | Chụp các màn đã đăng nhập; đi thử 3 tác vụ: học tiếp, thêm một từ, ôn thẻ đến hạn; ghi điểm gây vướng. | Danh sách vấn đề đã xác nhận, không dựa riêng vào demo. |
| 1. Bản vẽ và hệ thiết kế | Sơ đồ điều hướng, wireframe mobile/desktop cho Dashboard, Bài học, Từ vựng, Flashcard; màu, chữ, nút, form, trạng thái. | Bản vẽ có thể xem và góp ý trước khi sửa mã. |
| 2. Nền giao diện | Điều hướng 4 mục, header/menu tài khoản, tokens, các thành phần dùng chung, trạng thái loading/empty/error. | Trang chính đi lại được trên mobile/desktop, không đổi chức năng. |
| 3. Luồng học liệu | Dashboard, danh sách 50 bài, trang bài, thêm/sửa/xóa từ vựng và ngữ pháp. | Tác vụ học tiếp và thêm học liệu nhanh hơn, dữ liệu Supabase giữ nguyên. |
| 4. Luồng luyện và thống kê | Flashcard, Ôn tập, Quiz, Games, Tiến độ, Cài đặt. | Không đổi quy tắc chấm/ghi dữ liệu; giao diện thống nhất. |
| 5. Nghiệm thu | Kiểm tra responsive, bàn phím, trình đọc màn hình, IME, demo, hai tài khoản, CRUD, FSRS, build; triển khai VPS và kiểm tra sau deploy. | Danh sách kiểm tra đạt, có ảnh trước/sau và không mất dữ liệu. |

## 8. Tiêu chí nghiệm thu

- Từ Dashboard tới thao tác **Ôn** hoặc **Học tiếp** tối đa hai lần chạm/nhấp.
- Tìm được bài theo số hoặc trạng thái mà không cần cuộn qua cả 50 bài.
- Thêm một từ với các trường cốt lõi trên một màn; trường nâng cao chỉ mở khi cần.
- Không tràn ngang ở viewport 360, 390, 768 và 1280 px; nội dung chính không bị thanh điều hướng che.
- Có thể hoàn thành các tác vụ học tiếp, thêm từ, ôn Flashcard và làm Quiz bằng bàn phím; các trạng thái quan trọng được công bố cho trình đọc màn hình.
- Dữ liệu tài khoản, quyền RLS, đường dẫn, logic FSRS và kết quả Quiz/Games không đổi; demo không bị hiểu nhầm là đã lưu.
- Kiểm tra TypeScript, lint, unit test hiện có và build trước khi triển khai; kiểm thử thao tác thật sau khi lên VPS.

## 9. Quyết định cần xác nhận

- Phong cách cuối cùng: tối giản ấm, trung tính hiện đại hay thiên về game.
- Thiết bị ưu tiên: điện thoại, máy tính hay cân bằng.
- Sau giai đoạn 1, duyệt bản vẽ Dashboard và trang Bài học trước khi sửa toàn bộ giao diện.
