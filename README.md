# ATV Security Portal — GitHub Pages prototype

Website tĩnh, tiếng Việt, không backend, không thư viện/CDN bên ngoài. Mở `index.html` trong trình duyệt để thử. Bản tóm tắt học liệu dựa trên cấu trúc tài liệu ATV, không thay thế tài liệu đã được phê duyệt. Cần Security duyệt nội dung trước khi công khai.

## Triển khai GitHub Pages

1. Tạo repository `atv-security` (hoặc repository riêng được phép) trên tài khoản GitHub mong muốn.
2. Upload `index.html`, `.nojekyll` và README.md vào nhánh `main`. Không upload danh mục Drive riêng, ngân hàng đáp án hoặc hồ sơ nội bộ.
3. Mở Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` → `/(root)` → Save.
4. Kiểm tra URL do GitHub Pages cung cấp và quyền truy cập. URL dự kiến cho project site: `https://<username>.github.io/atv-security/`.

## Tính năng và giới hạn

- 19 bài học ngắn, 8 quy tắc, phân loại thông tin, tìm kiếm, 15 câu hỏi ôn tập minh họa, mẫu báo cáo tạo cục bộ, checklist và thư viện.
- Tiến độ lưu bằng localStorage tại trình duyệt. Không dùng làm kết quả đào tạo chính thức. Không xác thực người học, không có cơ sở dữ liệu, không chấm bài thi chính thức.
- Danh mục Drive riêng (`atv-drive-catalog-private.json`, giao riêng) được chọn trong Thư viện; đọc trong phiên trình duyệt, không truyền tới máy chủ. Drive vẫn kiểm soát quyền truy cập. Không commit JSON này lên GitHub.
- Hồ sơ nhân sự, câu hỏi và đáp án chính thức, báo cáo khách hàng và nội dung nhạy cảm tuyệt đối không được đưa vào website công khai. Không dùng JS/password phía trình duyệt để giả lập phân quyền.
- GitHub Pages thường công khai kể cả repository private. Muốn lưu nội dung nội bộ hoặc thi chính thức cần hạ tầng truy cập hạn chế phù hợp, xác thực tài khoản, phân quyền máy chủ, quản lý lượt thi và dữ liệu.
- Không tự đồng bộ Drive; cập nhật học liệu và danh mục riêng sau khi tài liệu được duyệt.
