# ATV Security Portal — GitHub Pages prototype

Website tĩnh, tiếng Việt, không backend riêng; Firebase SDK tải từ CDN Google để xác thực. Mở `index.html` trong trình duyệt để thử. Bản tóm tắt học liệu dựa trên cấu trúc tài liệu ATV, không thay thế tài liệu đã được phê duyệt. Cần Security duyệt nội dung trước khi công khai.

## Triển khai GitHub Pages

1. Tạo repository `atv-security` (hoặc repository riêng được phép) trên tài khoản GitHub mong muốn.
2. Upload `index.html`, `.nojekyll` và README.md vào nhánh `main`. Không upload danh mục Drive riêng, ngân hàng đáp án hoặc hồ sơ nội bộ.
3. Mở Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` → `/(root)` → Save.
4. Kiểm tra URL do GitHub Pages cung cấp và quyền truy cập. URL dự kiến cho project site: `https://<username>.github.io/atv-security/`.

## Tính năng và giới hạn

- 19 bài học mở rộng, 14 nguồn tham chiếu, 8 quy tắc, phân loại thông tin, tìm kiếm, 15 câu hỏi ôn tập minh họa, mẫu báo cáo tạo cục bộ, checklist và thư viện.
- Tiến độ lưu bằng localStorage tại trình duyệt. Không dùng làm kết quả đào tạo chính thức. Xác thực Google qua Firebase khi được cấu hình; tiến độ tách theo UID nhưng chỉ lưu cục bộ. Không có cơ sở dữ liệu hoặc chấm thi chính thức.
- Danh mục Drive riêng (`atv-drive-catalog-private.json`, giao riêng) được chọn trong Thư viện; đọc trong phiên trình duyệt, không truyền tới máy chủ. Drive vẫn kiểm soát quyền truy cập. Không commit JSON này lên GitHub.
- Hồ sơ nhân sự, câu hỏi và đáp án chính thức, báo cáo khách hàng và nội dung nhạy cảm tuyệt đối không được đưa vào website công khai. Không dùng JS/password phía trình duyệt để giả lập phân quyền.
- GitHub Pages thường công khai kể cả repository private. Muốn lưu nội dung nội bộ hoặc thi chính thức cần hạ tầng truy cập hạn chế phù hợp, xác thực tài khoản, phân quyền máy chủ, quản lý lượt thi và dữ liệu.
- Không tự đồng bộ Drive; cập nhật học liệu và danh mục riêng sau khi tài liệu được duyệt.

## Firebase Authentication (v0.3)
1. Tạo hoặc chọn project tại https://console.firebase.google.com/ rồi đăng ký Web App.
2. Project settings → Your apps → SDK setup and configuration → Config. Điền các trường public client config vào `firebase-config.js`. Không commit service account, OAuth client secret, private key hay thông tin admin.
3. Authentication → Sign-in method → Google → Enable, chọn support email và lưu.
4. Authentication → Settings → Authorized domains → thêm `hongluuatv.github.io` (chỉ hostname, không có đường dẫn).
5. Kiểm tra `ATV_AUTH_POLICY`. Tạm dùng domain `arrow-tech.vn`; xác nhận domain Workspace chính thức, hoặc dùng danh sách email được phép. Không bật allowAnyVerifiedGoogleAccount nếu chỉ dành cho nội bộ.
6. Commit config lên main và kiểm tra Pages. Khi chưa có config, portal hiển thị màn hình đăng nhập nhưng vô hiệu hóa nút Google.
7. Kiểm thử email được phép, email ngoài phạm vi, popup bị chặn, tải lại trang và đăng xuất. Phiên dùng browserSessionPersistence.

**Giới hạn:** Firebase xác thực danh tính; lọc domain/email tại client chỉ điều khiển giao diện, không thực thi phân quyền máy chủ. GitHub Pages cung cấp mã nguồn và học liệu tĩnh cho người truy cập. Không đưa bí mật hoặc hồ sơ đào tạo vào HTML/JS. Muốn giới hạn nội dung thật sự cần backend kiểm tra Firebase ID token và quyền, hoặc hosting nội bộ có kiểm soát truy cập. Firebase config phía web là thông tin công khai; giữ Security Rules mặc định từ chối nếu chưa triển khai dịch vụ dữ liệu. 
Tài liệu: https://firebase.google.com/docs/auth/web/google-signin và https://firebase.google.com/docs/auth/web/auth-state-persistence .

## Đánh giá định kỳ (v0.4)

- General và Technical: mỗi lượt chọn 20 câu từ ngân hàng riêng, đảo thứ tự câu và phương án. Ngưỡng đạt đề xuất 80% (16/20); không giới hạn số lượt thi đã nộp. Mỗi khóa có một lượt đang làm, mở lại trong 24 giờ; lựa chọn chưa nộp chỉ giữ trong phiên trang.
- Máy chủ kiểm tra Firebase ID token, Google provider, email đã xác thực và domain `arrow-tech.vn`. Nếu thay đổi chính sách email cần cập nhật cả Firebase UI và hàm `identity` trong `functions/index.js`.
- Cloud Functions chọn đề/chấm điểm, ghi điểm và tổng hợp bằng Firestore transaction. Client không có quyền ghi/sửa/xóa điểm, không nhận đáp án đúng; nộp lại cùng mã lượt trả về kết quả đã lưu thay vì tạo lượt trùng.
- Firestore: `assessmentBanks/{course}` (đề riêng), `assessmentSessions/{uid}/active/{course}` (lượt chưa nộp), `assessmentResults/{uid}/attempts/{attemptId}` (lịch sử) và `assessmentResults/{uid}` (tổng hợp).
- Chỉ tài khoản sở hữu truy xuất lịch sử qua callable; không có dashboard quản trị HR. Admin Firebase có quyền IAM phù hợp mới được xem dữ liệu trong Console. Không lưu bài thi trong localStorage; tiến độ học cũ vẫn cục bộ.
- Đề mẫu công khai trong `examples/` chỉ dùng thử, không phải ngân hàng đề chính thức. Hệ thống không phải công cụ giám sát thi, không ngăn được chia sẻ câu hỏi hoặc sử dụng tài liệu ngoài. Không commit ngân hàng thật, đáp án hoặc thông tin nhân sự. Xác định chính sách lưu giữ, xóa và duyệt kết quả trước khi áp dụng chính thức.

### Triển khai backend Firebase (một lần)

Cần quyền quản trị project `atv-security`, Node.js 22, Firebase CLI, gcloud CLI nếu dùng công cụ nhập đề, và Firebase Blaze (pay-as-you-go) để deploy Cloud Functions. Kiểm tra chi phí và bật cảnh báo ngân sách. Tạo Cloud Firestore database mặc định ở khu vực đã được ATV phê duyệt; Functions chọn `asia-southeast1`. Không tự thay vị trí database đã có.

```bash
git clone https://github.com/hongluuatv/atv-security.git
cd atv-security
npm install -g firebase-tools
firebase login
npm --prefix functions install
npm --prefix functions run check
firebase deploy --only functions,firestore:rules --project atv-security
```

**Lưu ý:** `firestore.rules` mặc định từ chối toàn bộ truy cập trực tiếp từ client. Nếu project đã có các ứng dụng/collection khác, phải hợp nhất và rà soát Rules hiện hành, không ghi đè mù quáng. Các hàm dùng Admin SDK, nên chúng tự kiểm tra danh tính và quyền. Không dùng rules test mode hoặc allow read/write công khai.

### Nhập ngân hàng đề (quản trị viên)

Dùng Application Default Credentials trên máy quản trị được phép, không tạo hoặc commit khóa service account.

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project atv-security
# Chỉ để thử hệ thống; các đề DEMO và đáp án đều công khai:
node functions/seed.js examples/demo-general.json general atv-security
node functions/seed.js examples/demo-technical.json technical atv-security
```

Để triển khai chính thức, chuẩn bị JSON riêng ngoài repository có schema như ví dụ (`version`, `questions`: mỗi câu có `prompt`, `options`, `correctIndex` đánh số từ 0), tối thiểu 20 câu hợp lệ mỗi khóa, tối đa 150. Chạy seed với đường dẫn tuyệt đối đến file riêng. Lưu ý seed thay thế ngân hàng của khóa được chọn, không xóa lịch sử; đặt version mới khi cập nhật. Không nhập DEMO vào môi trường chính thức hoặc dùng điểm DEMO làm bằng chứng. Có thể nhập tài liệu bằng Firestore Console với schema tương ứng.

### Kiểm tra nghiệm thu

1. Đăng nhập Google bằng email công ty, mở Đánh giá định kỳ. Bắt đầu, trả lời đủ, nộp bài, xem điểm và lịch sử; thi lại, xác minh hai bản ghi riêng biệt.
2. Kiểm tra tài khoản ngoài domain bị từ chối ở server, tài khoản A không đọc được dữ liệu B, không thể ghi điểm từ Web SDK.
3. Kiểm tra nộp cùng mã lượt hai lần chỉ có một bản ghi, reload mở lại lượt chưa nộp, lỗi mạng và quyền hiển thị rõ.
4. Rà soát ngân hàng, mức đạt, retention, quy định khách hàng và phân quyền HR trước khi nghiệm thu chính thức.
5. Firebase backend và Pages cần triển khai độc lập. GitHub Pages chỉ phục vụ frontend, không chạy Cloud Functions.

Tài liệu chính thức: https://firebase.google.com/docs/functions/callable ; https://firebase.google.com/docs/functions/get-started ; https://firebase.google.com/docs/firestore/security/rules-conditions .

## Quản lý hệ thống (v0.5 — thay thế hành vi đánh giá v0.4)

- **Admin mặc định:** `honglm@arrow-tech.vn`. Cloud Functions kiểm tra Firebase ID token của Google, email đã xác thực và email chính xác; lần đăng nhập đầu tiên tự tạo/cập nhật hồ sơ Admin, gắn UID và ghi audit. Không cần bootstrap thủ công cho email này. Không thể sửa/khóa admin mặc định qua API quản trị. Nếu UID đã gắn không khớp, Firebase IAM admin phải xử lý định danh thủ công.
- Admin quản lý người dùng theo domain hoặc whitelist, vai trò admin/employee, khóa/mở khóa và xem kết quả theo kỳ. Whitelist yêu cầu email mới được thêm trước; tài khoản đã đăng ký còn hiệu lực cho đến khi bị khóa. Admin khác không được tự khóa/hạ quyền mình. API kiểm tra hồ sơ từ Firestore, không tin role client. Nội dung website tĩnh vẫn công khai.
- Từ v0.5, đăng nhập cần callable `getPortalProfile` hoạt động; nếu backend chưa deploy hoặc lỗi, portal từ chối mở giao diện. Không tự cấp quyền dựa trên email phía client.
- Kỳ đánh giá: admin tạo nháp, chọn General/Technical, thời gian mở/đóng, số câu 5–50, điểm đạt 1–100%, thời lượng 5–1440 phút, số lượt tối đa 0–100 (0 = không giới hạn). Lượt chỉ nộp được trước thời hạn và trước khi kỳ đóng. Khi công bố, sao chép ngân hàng hiện tại thành snapshot riêng, không sửa cấu hình đã công bố. Kỳ DEMO phải được xác nhận rõ; không dùng điểm DEMO làm chứng cứ.
- Người học chọn kỳ đã công bố; lịch sử cũ không xóa. Các lượt chưa nộp của v0.4 không được chuyển đổi. Giới hạn lượt tính theo lượt đã nộp. Admin xem thống kê người đã nộp theo kỳ, chưa có phân công cá nhân, danh sách người chưa thi, xuất Excel hoặc quản lý ngân hàng qua UI.
- Collection mới: `portalUsers/{email}`, `portalSettings/access`, `portalAudit/{id}`, `assessmentPeriods/{id}`, `assessmentPeriodBanks/{id}`, `assessmentPeriods/{id}/results/{uid}`; mặc định Firestore Rules từ chối truy cập client trực tiếp. Thực hiện chính sách giữ dữ liệu và kiểm tra quyền IAM.
- Deploy cùng một project `atv-security` sau khi tạo Firestore và bật Blaze:
  ```bash
  npm --prefix functions install
  npm --prefix functions run check
  firebase deploy --only functions,firestore:rules,firestore:indexes --project atv-security
  ```
  Rà soát rules/indexes hiện có trước khi thay thế. Chờ index build xong. Cần nạp ngân hàng đề riêng theo phần trước, đăng nhập bằng admin mặc định, tạo và công bố kỳ, sau đó kiểm thử với tài khoản nhân viên. Không commit đề thật hoặc thông tin nhân sự.
