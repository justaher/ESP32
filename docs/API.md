# PowerGrid API

Base URL khi chạy local: `http://localhost:4000`. JSON UTF-8. Giờ thiết bị gửi bằng UTC; thống kê theo UTC+7.

## Đăng nhập

Frontend đăng ký bằng `createUserWithEmailAndPassword`, đăng nhập email/mật khẩu qua Firebase Authentication và gửi ID token vào `Authorization: Bearer <token>`. Đăng ký thành công tự đăng nhập. Backend dùng Firebase Admin `verifyIdToken(token, true)`; không lưu mật khẩu trong Firestore.

`ACCESS_MODE=registered` cho phép tài khoản email đã đăng nhập trong Firebase project truy cập cùng hệ thống hai tủ và xử lý sự cố. Không tách dữ liệu theo tài khoản. `ACCESS_MODE=allowlist` chỉ cho phép email trong `ALLOWED_EMAILS`; tài khoản mới ngoài danh sách nhận 403. Nếu không khai báo ACCESS_MODE, backend giữ chế độ allowlist. Người chưa đăng nhập hoặc token không hợp lệ luôn nhận 401.

## API người vận hành

| Method | URL | Kết quả |
|---|---|---|
| GET | `/health` | Trạng thái tiến trình; không kiểm tra kết nối Firestore |
| GET | `/api/bootstrap` | Hai tủ, danh sách thiết bị, lần đo gần nhất, điện năng hôm nay/tháng này, sự cố |
| GET | `/api/energy?period=week&anchor=2026-09-14` | Các ngày trong tuần (thứ hai–chủ nhật) |
| GET | `/api/energy?period=month&anchor=2026-09-14` | Các ngày trong tháng |
| GET | `/api/energy?period=year&anchor=2026-09-14` | 12 tháng trong năm |
| GET | `/api/energy?...&deviceId=light-a` | Điện năng một thiết bị |
| PATCH | `/api/incidents/{id}/resolve` | Body `{"note":"Đã kiểm tra và khắc phục nguồn cấp."}` |

`null` là không có mẫu đo hợp lệ, khác với `0` là đã đo và không tiêu thụ. Sự cố còn `active: true` trả 409 khi hoàn tất xử lý. Sự cố đã khôi phục vẫn ở trạng thái `open` tới khi người vận hành nhập ghi chú. Lịch sử trả về 200 bản ghi gần nhất toàn hệ thống cùng **tất cả sự cố chưa xử lý**; các bản ghi cũ hơn vẫn được giữ trong Firestore.

## ESP32 gửi dữ liệu

### Khai báo thiết bị trước lần gửi đầu

`POST /api/devices/register`, header `X-Device-Key` là khóa riêng đã khai báo trong `DEVICE_KEYS_JSON` của backend. Không cần Firebase ID token cho API phần cứng này.

```json
{
  "id": "fan-04",
  "cabinetId": "cabinet-1",
  "name": "Quạt thông gió số 4",
  "type": "fan",
  "ratedPowerW": 1500,
  "thresholds": {
    "minVoltage": 200,
    "maxVoltage": 250,
    "maxCurrent": 10,
    "maxTemperature": 70
  }
}
```

Backend lưu vào `devices/{id}` trong Firestore. Chế độ thật chỉ đọc danh sách này, không tự tạo sáu thiết bị mẫu. Có thể khai báo 1, 4, 8 hoặc nhiều thiết bị mỗi tủ; giao diện tự sắp xếp theo số lượng. Hai tủ có mã `cabinet-1` và `cabinet-2`. `type` hỗ trợ `light`, `fan`, `pump`, `motor`, `other`.

Phản hồi: 201 khi mới tạo, 200 nếu gửi lại cấu hình giống hệt, 409 nếu ID đã có cấu hình khác, 401 nếu khóa sai, 400 nếu cấu hình không hợp lệ. Khởi động lại không tạo thiết bị trùng. Không cho thiết bị tự chuyển tủ/đổi ngưỡng bằng khai báo khác; nếu cần thay cấu hình, người vận hành có quyền Firebase cập nhật document và cấu hình firmware cùng nhau. Không di chuyển thiết bị đã có dữ liệu lịch sử sang tủ khác; dùng ID mới để giữ nguyên ý nghĩa thống kê cũ.

Danh sách gồm cả thiết bị đã khai báo nhưng chưa gửi mẫu và thiết bị mất kết nối; trạng thái được hiển thị riêng. Sơ đồ là phân nhóm **tủ → thiết bị**, không phải bản vẽ dây điện, MCCB, relay hoặc mạng Modbus tự dò. ESP32/gateway phải khai báo đúng danh tính và tủ thực tế. Với gateway nhiều cảm biến, gọi đăng ký một lần cho từng deviceId, sau đó gửi số liệu cho từng ID.

### Gửi số liệu

`POST /api/telemetry`, header `Content-Type: application/json`, `X-Device-Key: <key riêng của thiết bị>`.

```json
{
  "sampleId": "boot_a12b_001",
  "deviceId": "light-a",
  "timestamp": "2026-09-14T03:20:00Z",
  "voltage": 230.4,
  "current": 2.1,
  "powerW": 465.5,
  "energyKwh": 125.376,
  "frequency": 50.02,
  "powerFactor": 0.96,
  "temperature": 35.2
}
```

- `timestamp` phải cách giờ server không quá 10 phút; đồng bộ NTP trên ESP32.
- `sampleId` là duy nhất theo lần khởi động + số thứ tự. Khi thử lại cùng một mẫu, giữ nguyên sampleId và timestamp. Firestore transaction bỏ qua mẫu trùng.
- Nếu chưa đăng ký deviceId, API trả 409 `DEVICE_NOT_REGISTERED`. Firmware cũ chỉ POST số liệu phải được cập nhật hoặc khai báo thiết bị trước bằng API đăng ký.
- `energyKwh` là **bộ đếm tích lũy**, không phải công suất, không phải điện năng riêng một lần gửi. Không đặt lại sau mỗi lần POST.
- `frequency`, `powerFactor`, `temperature` có thể bỏ qua nếu không có cảm biến.
- `202`: đã tiếp nhận / mẫu trùng đã bỏ qua; `400`: sai cấu trúc/giờ; `401`: sai khóa; `409`: dữ liệu cũ hoặc bước tăng điện năng không hợp lý; `429`: giới hạn request; `500`: lỗi backend.
- Mẫu đo gợi ý 10 giây/lần/thiết bị. Giới hạn 300 request/phút/IP. Thiết bị bị coi là mất kết nối khi lần đo cũ hơn 60 giây; hiện chưa có tác vụ nền lưu sự cố offline ngay tại thời điểm mất mạng. Khi kết nối lại sau >15 phút sẽ lưu sự cố gián đoạn.

## Tính điện năng và dữ liệu thiếu

`delta kWh = energyKwh mới - energyKwh trước`. Bản đầu tiên chỉ làm mốc. Transaction cập nhật đồng thời mẫu đo, mốc cuối, điện năng ngày và sự cố.

Nếu qua nửa đêm, điện năng chia tỷ lệ theo thời gian ở hai ngày. Đây là **ước lượng phân bổ**, không phải dữ liệu đo riêng từng phía nửa đêm. Khoảng cách >15 phút hoặc bộ đếm giảm: không cộng khoảng đó, thiết lập mốc mới và tạo sự cố chất lượng dữ liệu. Mẫu không tăng thời gian hoặc điện năng tăng quá công suất định mức × 5 × thời gian (+0,01 kWh dung sai) bị từ chối. Thiết lập đúng `ratedPowerW` trong khai báo thiết bị trước khi dùng.

Tổng hiển thị là tổng **đã ghi nhận**, có thể thiếu khi một/một số thiết bị mất dữ liệu. `coverageSeconds` ở energyDaily/API là số giây có dữ liệu hợp lệ cộng theo thiết bị; không phải phần trăm thời gian toàn hệ thống.

## Collections Firestore

| Collection | Nội dung |
|---|---|
| `devices/{deviceId}` | Danh mục thiết bị thật: tên, tủ, loại, công suất định mức, ngưỡng |
| `readings/{deviceId}` | Lần đo cuối |
| `telemetry/{deviceId}_{sampleId}` | Mẫu đo và khóa chống trùng |
| `energyDaily/{deviceId}_{YYYY-MM-DD}` | kWh/ngày và giây dữ liệu hợp lệ |
| `deviceStates/{deviceId}` | Ánh xạ lỗi đang xảy ra để không tạo trùng cảnh báo |
| `incidents/{autoId}` | Lịch sử phát sinh, khôi phục, xử lý, người xử lý và ghi chú |

Tạo TTL trên `telemetry.expiresAt` nếu muốn tự xóa mẫu thô sau 30 ngày; TTL không tự bật bằng code. Dữ liệu tổng hợp và sự cố không có TTL. Truy vấn hiện dùng chỉ mục đơn trường mặc định. Không thêm chỉ mục tổng hợp nếu Firebase không yêu cầu.

Client không truy cập trực tiếp Firestore. Rule trong `firebase/firestore.rules` chặn client, Admin SDK dùng IAM của service account. Nếu Firebase project hiện có ứng dụng khác, ghép rule cho collections của PowerGrid thay vì ghi đè rule của ứng dụng đó.
