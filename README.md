# Giới hạn thời gian mạng xã hội — Edge Extension

Extension giới hạn thời gian sử dụng Facebook, Instagram (và các trang bạn tự thêm).
Khi hết giờ, tab sẽ tự động chuyển sang trang nhắn tin của mạng xã hội đó
(VD: `facebook.com/messages`) thay vì chặn hoàn toàn.

## Tính năng

- ✅ Theo dõi thời gian sử dụng theo từng trang (độ chính xác ~1 phút)
- ✅ Tự động chuyển sang trang tin nhắn khi hết giới hạn trong ngày
- ✅ Lưu toàn bộ dữ liệu (cấu hình + lịch sử dùng hàng ngày) vào **IndexedDB**
  của trình duyệt — không gửi lên server nào cả
- ✅ Thay đổi giới hạn thời gian bất cứ lúc nào (trang Options)
- ✅ Thêm/sửa/xoá trang mạng xã hội khác + URL trang nhắn tin tương ứng
- ✅ Biểu đồ thống kê theo **ngày (7 ngày gần nhất)**, **tuần (12 tuần)**,
  **tháng (12 tháng)** — vẽ bằng canvas, không cần thư viện ngoài

## Cấu trúc project

```
social-time-limiter/
├── manifest.json      # Manifest V3
├── background.js      # Service worker: đếm giờ + chuyển hướng
├── db.js               # Module dùng chung thao tác IndexedDB
├── popup.html/.js      # Popup khi bấm icon extension
├── options.html/.js    # Trang quản lý + biểu đồ thống kê
└── icons/               # Icon 16/32/48/128px
```

## Cách cài vào Microsoft Edge (chế độ Developer / Unpacked)

1. Giải nén thư mục `social-time-limiter` ra đâu đó trên máy (đừng xoá sau khi cài,
   Edge sẽ đọc trực tiếp từ thư mục này).
2. Mở Edge, vào địa chỉ: `edge://extensions/`
3. Bật **"Chế độ nhà phát triển" / "Developer mode"** (góc dưới trái).
4. Bấm **"Tải tiện ích đã giải nén" / "Load unpacked"**.
5. Chọn thư mục `social-time-limiter` (thư mục chứa file `manifest.json`).
6. Extension sẽ xuất hiện trên thanh công cụ — ghim lại để dễ truy cập.

## Cách dùng

- **Popup** (bấm icon): xem nhanh thời gian đã dùng hôm nay của từng trang
  đang bật, có thanh tiến trình so với giới hạn.
- **Trang Quản lý & Thống kê** (bấm nút trong popup, hoặc chuột phải icon →
  "Tuỳ chọn phần mở rộng"):
  - Tab **"Quản lý trang"**: bật/tắt, sửa tên, domain, URL trang nhắn tin,
    giới hạn phút/ngày ngay trên bảng (tự lưu khi thay đổi); thêm trang mới
    ở hàng dưới cùng.
  - Tab **"Thống kê"**: chọn trang + khoảng thời gian (ngày/tuần/tháng) để
    xem biểu đồ cột thời gian sử dụng, kèm tổng/trung bình/cao nhất.

## Mặc định sẵn có

| Trang     | Domain        | Giới hạn mặc định | Trang nhắn tin                          |
| --------- | ------------- | ----------------- | --------------------------------------- |
| Facebook  | facebook.com  | 30 phút/ngày      | https://www.facebook.com/messages       |
| Instagram | instagram.com | 30 phút/ngày      | https://www.instagram.com/direct/inbox/ |

Bạn có thể sửa hoặc xoá 2 trang này, và thêm bao nhiêu trang tuỳ ý
(VD: TikTok, X/Twitter, YouTube...) — chỉ cần nhập domain và URL trang nhắn
tin/hộp thư tương ứng của trang đó.

## Ghi chú kỹ thuật

- Thời gian chỉ được tính khi **tab đang active** VÀ **cửa sổ trình duyệt
  đang được focus**, dùng `chrome.tabs`/`chrome.windows` API.
- Việc cộng dồn thời gian dùng `chrome.alarms` (chu kỳ 1 phút) vì Manifest V3
  service worker có thể bị trình duyệt tạm ngưng — `alarms` đảm bảo bộ đếm
  vẫn hoạt động chính xác dù service worker "ngủ".
- Khi tổng thời gian trong ngày ≥ giới hạn, extension sẽ tự `chrome.tabs.update`
  toàn bộ tab đang mở của trang đó sang URL trang nhắn tin.
- Dữ liệu lưu trong IndexedDB riêng của extension (`socialTimeLimiterDB`),
  tồn tại lâu dài trên máy, không đồng bộ qua tài khoản Edge.
