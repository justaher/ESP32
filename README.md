# PowerGrid — Giám sát tủ điện ESP32

Web tiếng Việt, giao diện xanh đậm/cam. Tách **frontend React/TypeScript**, **backend Node.js/Express**, **Firebase Authentication + Cloud Firestore**, firmware ESP32.

## Chạy giao diện ngay

Yêu cầu Node.js 22.13+ và npm. Mở terminal tại thư mục `ESP32`:

```powershell
npm run setup
npm run dev:fe
```

Mở địa chỉ Local trong terminal (mặc định `http://localhost:3000`). Bấm **Xem thử bảng điều khiển** để dùng dữ liệu mẫu mà không cần Firebase hoặc phần cứng. Demo trong bộ nhớ trình duyệt, không ghi database, không giả đăng nhập Firebase. Đăng xuất bằng biểu tượng cạnh tài khoản; trên điện thoại dùng biểu tượng trên thanh đầu trang.

## Chức năng

- Đăng ký, đăng nhập/đăng xuất email và mật khẩu Firebase; đặt lại mật khẩu. Đăng ký thành công tự đăng nhập.
- Tổng quan điện năng hôm nay/tháng này, công suất thiết bị trực tuyến, cảnh báo chưa xử lý.
- Hai tủ chiếu sáng/động lực: chọn tủ → sơ đồ/danh sách thiết bị → thông số chi tiết.
- Điện áp, dòng điện, công suất, kWh hôm nay/tích lũy; tần số, hệ số công suất, nhiệt độ nếu có cảm biến.
- Biểu đồ và bảng điện năng tuần/tháng/năm, chọn thời gian, xuất CSV.
- Tìm thiết bị/sự cố, lọc trạng thái, lưu ghi chú xử lý và người xử lý.
- Tự phát hiện vượt ngưỡng điện áp/dòng điện/nhiệt độ. Giữ cảnh báo tới khi người vận hành xác nhận sau khi hết lỗi.
- Mẫu ESP32 gửi HTTP/HTTPS, NTP, khóa riêng thiết bị và chống cộng điện năng trùng khi retry.

## Cấu trúc

```text
ESP32/
├── frontend/                 # React, TypeScript, Vinext/Vite; cổng 3000
│   ├── app/                  # Màn hình, layout, CSS
│   ├── components/           # Biểu đồ
│   ├── lib/                  # Firebase client, API, types, demo
│   └── .env.example
├── backend/                  # Node.js + Express; cổng 4000
│   ├── src/catalog.js        # Hai tủ, thiết bị, công suất và ngưỡng
│   ├── src/app.js            # API, xác thực, phân quyền
│   ├── src/store.js          # Firestore transactions
│   ├── src/domain.js         # Tính điện năng, lịch UTC+7, kiểm tra dữ liệu
│   ├── scripts/simulate.js   # Gửi thử vào Firebase project test
│   ├── test/
│   └── .env.example
├── firmware/powergrid_esp32/ # Mẫu ESP32 + PZEM-004T v3 (Arduino IDE)
├── firebase/firestore.rules
└── docs/API.md               # API, schema, công thức và giới hạn
```

`hehe.js` giữ nguyên. Frontend có scaffold Sites nhưng API Node.js là tiến trình riêng; hosting frontend không tự triển khai backend.

## Kết nối Firebase

Mặc định dùng **Cloud Firestore**, chưa phải Realtime Database. Nếu project đang dùng Realtime Database cần đổi adapter backend. Repo không chứa credential thật.

1. Firebase Console → Authentication → Sign-in method → bật **Email/Password**.
2. Người dùng có thể bấm **Đăng ký ngay** trên web để tạo tài khoản; không cần tạo thủ công trong Console. Không có mật khẩu mặc định.
3. Project settings → Your apps → tạo/chọn Web app và lấy `firebaseConfig`.
4. Sao chép `frontend/.env.example` thành `frontend/.env.local`. Điền `NEXT_PUBLIC_FIREBASE_*` tương ứng `apiKey`, `authDomain`, `projectId`, `appId`. Giữ `NEXT_PUBLIC_API_URL=http://localhost:4000` khi chạy local.
5. Tạo Cloud Firestore nếu chưa có. Áp dụng rules trong `firebase/firestore.rules`; nếu project có ứng dụng khác, ghép rules theo collection thay vì ghi đè toàn bộ.
6. Project settings → Service accounts → tạo credential backend. Lưu JSON **ngoài repo**, ví dụ `C:/secure/powergrid-service-account.json`; không đưa private key vào chat/frontend.
7. Sao chép `backend/.env.example` thành `backend/.env`. Điền `FIREBASE_PROJECT_ID`, đường dẫn `GOOGLE_APPLICATION_CREDENTIALS`. Giữ `ACCESS_MODE=registered` để người đăng ký có thể sử dụng hệ thống; `ALLOWED_EMAILS` không bắt buộc ở chế độ này.
8. Tạo khóa thiết bị bằng lệnh dưới, đặt vào `DEVICE_KEYS_JSON`, ví dụ `{"light-a":"<khóa vừa tạo>"}`. Không dùng khóa mẫu.
9. Authentication → Settings → Authorized domains: thêm `localhost` nếu chưa có và hostname frontend thật khi deploy.
10. Chạy backend trong terminal thứ hai, khởi động lại frontend sau khi thay `.env.local`.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run dev:be
```

Trên web, chọn **Đăng ký ngay**, nhập email/mật khẩu/nhập lại mật khẩu. Tài khoản mới tự đăng nhập và có quyền xem dữ liệu, xử lý sự cố của **cùng hệ thống hai tủ điện**. Chưa tách dữ liệu riêng theo người dùng. Nếu muốn giới hạn người truy cập, đổi `ACCESS_MODE=allowlist` và điền `ALLOWED_EMAILS`; khi đó đăng ký vẫn tạo tài khoản nhưng API chỉ cho email trong danh sách truy cập. Lần đầu chưa có mẫu đo hiển thị `—`, không lấy dữ liệu demo thay thế.

## Kết nối ESP32

Chưa có thông tin cảm biến thật nên firmware là **mẫu ESP32 + PZEM-004T v3 một pha**, không khẳng định phù hợp mọi Arduino hoặc công tơ ba pha.

1. Arduino IDE: cài ESP32 board package, **PZEM004Tv30** (mandulaj), **ArduinoJson 7**.
2. Mở `firmware/powergrid_esp32/powergrid_esp32.ino`.
3. Sao chép `secrets.example.h` thành `secrets.h`, điền Wi-Fi, API_URL, DEVICE_ID/DEVICE_KEY. `secrets.h` được Git bỏ qua.
4. Chỉnh chân UART theo board (mẫu RX16/TX17). Với cảm biến khác, thay `readMeasurements()`, giữ đơn vị V, A, W, kWh tích lũy.
5. Cho ESP32 truy cập máy trong LAN: backend `HOST=0.0.0.0`, firmware `http://<IP-LAN-máy-tính>:4000/api/telemetry`. Cho phép cổng 4000 trên mạng riêng nếu firewall chặn. `localhost` trên ESP32 không phải máy tính.
6. HTTPS cần CA phù hợp trong `ROOT_CA`. Khi đưa lên Internet dùng HTTPS cho cả frontend/backend và đặt `FRONTEND_ORIGIN` đúng frontend.
7. Sketch gửi một deviceId. Dùng nhiều ESP32 hoặc mở rộng gateway đọc nhiều cảm biến và gửi từng deviceId. Muốn số liệu từng thiết bị phải đo riêng từng nhánh; công tơ tổng không tự tách tiêu thụ từng thiết bị.
8. Chỉnh tên, `ratedPowerW` và ngưỡng trong `backend/src/catalog.js` theo thiết bị thật. Mặc định ngưỡng mẫu 230 V một pha.

Không reset bộ đếm kWh sau mỗi lần gửi. Mẫu đầu lập mốc; từ mẫu thứ hai bắt đầu tính điện năng. Thiết bị được coi là mất kết nối sau 60 giây không có dữ liệu mới. Firmware không điều khiển relay hoặc đóng/cắt tải.

## Kiểm tra

```powershell
npm test
cd frontend
npx tsc --noEmit
npm run build
```

Test bao gồm quyền API, dữ liệu không hợp lệ, lịch UTC+7, kWh qua nửa đêm, reset/mất dữ liệu và cảnh báo. Chưa kiểm tra Firebase thật hoặc nạp board vì thiếu cấu hình/phần cứng. Cần thử với thiết bị thực trước khi dùng vận hành.

Số liệu cập nhật mỗi 10 giây, biểu đồ mỗi phút. Chỉ cộng khoảng đo hợp lệ; khoảng gián đoạn >15 phút bị bỏ qua và tạo sự cố khi kết nối lại. Phân bổ điện năng qua nửa đêm theo tỷ lệ thời gian. Xem `docs/API.md` để biết giới hạn và schema. Màn hình lịch sử gồm tối đa 200 sự cố gần nhất toàn hệ thống và mọi sự cố chưa xử lý; bản ghi cũ hơn vẫn lưu database.

Để mô phỏng đường truyền: dùng Firebase project **test riêng**, cấu hình backend rồi đặt `ALLOW_SIMULATED_WRITES=true`, chạy `npm run simulate` trong `backend`. Lệnh ghi dữ liệu thử vào database đã cấu hình, không dùng trên project dữ liệu thật. Demo trên web không cần lệnh này.

## Tham chiếu

- [Firebase: email/mật khẩu](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase Admin: ID token](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [PZEM-004T v3](https://github.com/mandulaj/PZEM-004T-v30)
- [ESP32 TLS client](https://github.com/espressif/arduino-esp32/blob/master/libraries/NetworkClientSecure/README.md)
