# antigravity-vi

Công cụ **Việt hóa giao diện** và **hiển thị Quota / Context phiên** trực tiếp trên ứng dụng **Antigravity Desktop** (Windows).

## Tính năng chính

- **Việt hóa giao diện (VI / EN):**
  - Dịch tự động giao diện theo từ điển và mẫu câu trong `vi-dict.json` (`exact`, `placeholders`, `patterns`), bỏ qua các vùng nhập liệu / mã nguồn (`code`, `pre`, `textarea`, `.monaco-editor`, `.xterm`, ...).
  - Nút chuyển nhanh ngôn ngữ **`🌐 VI`** / **`🌐 EN`** ở góc dưới bên phải hoặc phím tắt **`Ctrl+Shift+L`**.
- **Panel Quota mô hình & Context phiên:**
  - Hiển thị ngay phía trên nút **Cài đặt** trong thanh bên:
    - Hạn mức còn lại theo nhóm **Gemini** (`Tuần`, `5h`) và **Claude & GPT** (`Tuần`, `5h`) kèm thời gian reset.
    - Thanh theo dõi **Context phiên** hiện tại (`Input + Cache / Context window`) và nút đồng bộ thủ công `↻`.
  - Truy vấn trực tiếp Language Server nội bộ qua `ipcMain` / `ipcRenderer` (không cần cấu hình token thủ công).
- **Tự động giữ patch sau khi Antigravity cập nhật:**
  - Task `AntigravityViAutoPatch` kiểm tra mỗi 10 phút và tự động patch lại `app.asar` ngay khi Antigravity đóng.
  - Nút tắt Desktop **Việt hóa Antigravity** (`patch-now.cmd` + `vi-antigravity.ico`) giúp đóng, patch lại và mở lại Antigravity chỉ bằng 1 cú đúp chuột.

## Yêu cầu

- Windows 10 / 11
- [Node.js](https://nodejs.org/) (đã có `node` trong `PATH`)
- Antigravity Desktop cài tại `%LOCALAPPDATA%\Programs\antigravity`

## Cài đặt nhanh

```powershell
git clone https://github.com/hoangminhsang989/antigravity-vi.git "$env:USERPROFILE\.antigravity-vi"
cd "$env:USERPROFILE\.antigravity-vi"
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Tuỳ chọn khi chạy `install.ps1`:
- `-PatchNow`: đóng `Antigravity.exe` (nếu đang mở), patch `app.asar` và khởi động lại ngay.
- `-SkipShortcut`: không tạo shortcut ngoài Desktop.
- `-SkipTasks`: không đăng ký Windows Task Scheduler.

Nếu chỉ muốn chạy patch ngay thủ công, mở tệp `patch-now.cmd` (hoặc bấm đúp shortcut **Việt hóa Antigravity** ngoài Desktop).

## Kiểm tra trạng thái & gỡ cài đặt

```powershell
# Kiểm tra app.asar đã được patch chưa
node .\patch-antigravity.mjs --check

# Khôi phục app.asar gốc từ app.asar.orig
node .\unpatch-antigravity.mjs
```

## Cấu trúc thư mục

- `patch-antigravity.mjs`: đọc/vá `dist/main.js` và `dist/preload.js` trong `app.asar`, tự sao lưu `app.asar.orig`.
- `unpatch-antigravity.mjs`: khôi phục `app.asar` gốc từ `app.asar.orig`.
- `vi-inject.js`: script tiêm vào renderer xử lý Việt hóa DOM, nút chuyển `VI/EN`, panel Quota và Context phiên.
- `vi-dict.json`: từ điển Việt hóa (`exact`, `placeholders`, `patterns`).
- `patch-now.cmd`: đóng `Antigravity.exe`, chạy patch và mở lại ứng dụng.
- `auto-patch.ps1`: script kiểm tra định kỳ để tự patch lại sau khi Antigravity cập nhật.
- `install.ps1`: thiết lập Task Scheduler và tạo nút tắt **Việt hóa Antigravity** ngoài Desktop.
- `vi-antigravity.ico`: biểu tượng riêng cho nút tắt Desktop.
