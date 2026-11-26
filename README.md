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
