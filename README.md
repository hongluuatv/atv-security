# ATV Security Portal v0.6 — Firebase Only

Website đào tạo ATTT tiếng Việt, triển khai trên GitHub Pages. Firebase Authentication (Google) + Cloud Firestore. Không cần Cloud Functions, không yêu cầu Blaze để sử dụng Firestore trong hạn mức Spark.

## Kích hoạt (một lần)

1. Mở https://console.firebase.google.com/project/atv-security/firestore và tạo Cloud Firestore database mặc định, Production mode; chọn vị trí dữ liệu đã được ATV phê duyệt. Nếu database đã có, giữ nguyên.
2. Tại Firestore Database → Rules, sao chép toàn bộ nội dung `firestore.rules` từ repo, rà soát và nhấn Publish. Không dùng test mode. Nếu có ứng dụng khác dùng chung project, hợp nhất rules hiện có trước khi publish.
3. Từ v0.6.5, danh sách kỳ đánh giá sử dụng index mặc định của Firestore; không cần tạo composite index. Có thể triển khai Rules bằng CLI:

   ```bash
   git clone https://github.com/hongluuatv/atv-security.git
   cd atv-security
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project atv-security
   ```

4. Authentication → Sign-in method: Google đã bật; Authorized domains có `hongluuatv.github.io`. Firebase Web App config nằm trong firebase-config.js; không đưa khóa service account hay thông tin admin vào repo.
5. GitHub Settings → Pages: deploy branch main, root. Mở https://hongluuatv.github.io/atv-security/ và đăng nhập Google bằng `honglm@arrow-tech.vn`. Rules xác thực email và Google provider; profile mặc định tự cấp Admin, gắn UID. Không cần bootstrap bằng CLI.
6. Quản lý hệ thống → Kỳ đánh giá: nhập file JSON ngân hàng ba khóa theo hướng dẫn v0.6.4. Tạo kỳ, đặt ngày mở/đóng, số câu, ngưỡng đạt, thời lượng, số lượt, lưu nháp, công bố. Chọn giờ mở hiện tại hoặc trước đó nếu muốn thi ngay. Đề mẫu công khai có 24 câu mỗi khóa.

## Quyền, dữ liệu và giới hạn

- Admin mặc định không thể bị sửa/khóa từ giao diện. Admin quản lý người dùng (email công ty, vai trò admin/employee, khóa/mở khóa), chế độ domain/whitelist, kỳ đánh giá và kết quả theo kỳ. Whitelist yêu cầu email mới được thêm trước; người đã đăng ký còn hiệu lực đến khi bị khóa.
- Firestore Rules kiểm tra email Google đã xác thực, UID, trạng thái và vai trò trong Firestore; người dùng không thể tự nâng quyền. Chỉ owner hoặc admin có thể đọc lịch sử cá nhân; chỉ owner được tạo lượt thi; không cho sửa/xóa lượt đã lưu. Rules kiểm tra thời hạn, số lượt, điểm trong phạm vi và nhất quán số liệu, counter và attempt được ghi cùng transaction.
- Không có Cloud Functions: **chấm điểm ở trình duyệt, đáp án của kỳ đang mở có thể bị xem, người dùng kỹ thuật có thể gian lận điểm hợp lệ về cấu trúc.** Tất cả điểm mới có grading=client-unverified. Không coi điểm là bằng chứng thi chính thức nếu chưa xác minh; không đưa đề mật hoặc thông tin nhạy cảm lên Pages/Firestore bank. Kết quả lịch sử không bị xóa; bản cũ chưa nộp không chuyển đổi. Thống kê cá nhân tính trên số lượt đã tải, dùng Tải thêm để xem thêm.
- Thời gian bắt đầu và nộp bài được ghi bằng serverTimestamp; Rules kiểm tra đồng hồ máy chủ, thời hạn và số lượt đã nộp. Đồng hồ máy người dùng phải tương đối đúng (sai lệch trên 5 phút có thể làm từ chối lưu). Lượt chưa nộp không tính vào giới hạn; reload mở lại cùng đề trong thời hạn nhưng lựa chọn chưa nộp chỉ giữ trong phiên trang.
- Nhật ký quản trị được ghi bởi ứng dụng, không phải audit log bất biến đầy đủ mọi thao tác qua SDK; không dùng làm bằng chứng duy nhất.
- Kho dữ liệu: portalUsers, portalSettings, portalAudit, assessmentBanks, assessmentPeriodBanks, assessmentPeriods (results), assessmentSessions (active), assessmentResults (attempts). Bank theo kỳ được chốt khi publish. Tài khoản admin có thể quản lý dữ liệu qua Firebase Console với IAM tương ứng.
- Muốn dùng ngân hàng riêng, admin có thể nhập document `assessmentBanks/general` hoặc `assessmentBanks/technical` trong Firestore Console theo schema ví dụ tại examples/ (version, questions gồm prompt, options, correctIndex đếm từ 0). Giao diện hỗ trợ nhập file JSON ba khóa; không nhập đề mật. Chọn tối thiểu bằng số câu kỳ thi.
- Mã nguồn functions/ còn lưu trong repo như phương án cũ, không được frontend gọi và đã bỏ khỏi firebase.json. Nếu Functions từng được deploy, không tự xóa tài nguyên; quản trị viên cần rà soát và vô hiệu hóa backend cũ để tránh đường dẫn bỏ qua Rules qua Admin SDK. Không chạy các lệnh deploy Functions trước đây.
- GitHub Pages là hosting tĩnh công khai, login không bảo vệ HTML/JS. Không commit tài liệu Drive riêng, hồ sơ nhân sự, ngân hàng đáp án chính thức, dữ liệu khách hàng. Giới hạn Spark theo mức dùng; theo dõi quota.
- Cần nghiệm thu bằng ít nhất hai tài khoản: đăng nhập admin, thêm/khóa nhân viên, tạo/công bố kỳ DEMO, nộp bài và thi lại, kiểm tra Firestore và truy cập chéo bị từ chối, hết hạn và giới hạn lượt. Rules chưa kiểm thử trên emulator/project thực tế trong phiên cập nhật này.

Nguồn: https://firebase.google.com/docs/firestore/security/rules-conditions ; https://firebase.google.com/docs/firestore/manage-data/transactions ; https://firebase.google.com/docs/firestore/query-data/indexing .

## v0.6.3 — nhập ngân hàng Excel đã chuyển JSON

Tại Quản lý hệ thống → Kỳ đánh giá → Ngân hàng câu hỏi từ Excel / JSON, chọn JSON dạng `{schemaVersion:1,banks:{general:{version,questions},onboarding:{version,questions},technical:{version,questions}}}`. Xem số câu, xác nhận nhập; ứng dụng ghi ba ngân hàng trong một batch Firestore. Chỉ admin có quyền ghi. Không đưa JSON chứa đáp án lên GitHub. Các câu có metadata id, topic, explanation, source, origin, reference được giữ khi nhập. Đề có topic rút đều giữa các nhóm theo số câu; khuyến nghị General 20, Onboarding 15, Technical 20, 80% đạt. Đề DEMO cũ không đổi. Kỳ đã công bố vẫn dùng snapshot cũ.

**Cần Publish firestore.rules bản mới** để hỗ trợ Onboarding trước khi nhập. Sau đó tạo kỳ mới và công bố. Dữ liệu chỉ được nhập khi admin thực hiện trên portal; GitHub không tự seed Firebase. Các đáp án có thể đọc được bởi người tham gia kỳ đang mở vì phiên bản Spark chấm ở client; không dùng ngân hàng cần giữ bí mật nghiêm ngặt trong kiến trúc này.

## v0.6.4
Đã bỏ nút nạp DEMO; nhập ngân hàng JSON trước khi lưu kỳ mới. Không thay thế ngân hàng trong các kỳ đã công bố. Nếu ngân hàng hiện tại có version DEMO hoặc thiếu số câu, giao diện yêu cầu nhập JSON. 

## v0.6.6
Tách nhóm ĐÁNH GIÁ thành ATTT định kỳ, Nhân viên mới và Kỹ thuật (Tech). Mỗi trang chỉ hiển thị kỳ và lịch sử của khóa tương ứng; giữ trạng thái làm bài riêng trong phiên trang. Lọc dữ liệu theo khóa ở client sau truy vấn single-field có phân trang, không cần composite index; với dữ liệu lịch sử lớn có thể phát sinh nhiều lượt đọc Firestore. Giữ nguyên Security Rules, ngân hàng đề và dữ liệu cũ.
