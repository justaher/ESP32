# Hướng dẫn nhận code và kết nối ESP32

Hướng dẫn này dành cho người nhận repo, chạy cả frontend và backend trên máy của mình, rồi nối ESP32 trong cùng mạng Wi-Fi. Backend ghi dữ liệu vào Firebase trên Internet; máy tính và ESP32 cần có kết nối mạng.

## 1. Hiểu vai trò từng phần

```text
Cảm biến → ESP32 → HTTP POST → Node.js backend → Cloud Firestore
                                   ↑
Trình duyệt → React frontend → API có Firebase ID token
                  ↓
          Firebase Authentication (đăng ký/đăng nhập)
```

- Frontend hiển thị số liệu và gọi backend; không đọc cảm biến trực tiếp.
- Backend phải chạy để nhận số liệu, tính điện năng, tạo cảnh báo và cung cấp API cho web.
- Firebase Authentication quản lý tài khoản. Cloud Firestore lưu số liệu/sự cố.
- Firmware đọc cảm biến và gửi JSON theo hợp đồng trong [API.md](API.md).
- Tắt backend thì ESP32 không gửi vào database qua API này được. Mẫu firmware chỉ giữ một gói chờ trong RAM; không có lưu trữ offline dài hạn.
- Bản frontend trên Sites là một bản triển khai riêng. Chỉnh cấu hình/chạy code local không tự cập nhật bản Sites. Hướng dẫn này dùng `localhost` trên máy người nhận.

## 2. Những thứ cần bàn giao

| Nội dung | Lấy ở đâu? |
|---|---|
| Source FE/BE, firmware mẫu, hướng dẫn | Clone Git |
| Danh sách thư viện + lockfile | Đã có trong Git; cài bằng npm |
| `frontend/.env.local` | Người nhận tạo từ `.env.example`, điền firebaseConfig Web |
| `backend/.env` | Người nhận tạo từ `.env.example`, điền thông tin server |
| Credential service account JSON | Người có quyền Firebase cấp riêng cho backend, lưu ngoài repo |
| `firmware/powergrid_esp32/secrets.h` | Người nhận tạo từ `secrets.example.h` |
| Wi-Fi, IP máy tính, chân cảm biến | Điền theo nơi chạy thực tế |

Các file `.env`, `.env.local`, `secrets.h` không theo Git. Clone repo chưa đủ để chạy kết nối thật. Không gửi service-account/private key qua commit hoặc đưa vào frontend/firmware.

Nhóm cần thống nhất dùng **cùng Firebase project** nếu muốn chung tài khoản và số liệu. Có thể dùng project test riêng khi thử cảm biến. Cấu hình Firebase ở frontend và backend phải thuộc cùng project. Hiện app dùng Cloud Firestore; Realtime Database cần adapter khác.

## 3. Lấy code và cài thư viện (lần đầu)

Cài Git, Node.js 22.13+ và npm. Các lệnh dưới chạy trong PowerShell:

```powershell
git clone https://github.com/justaher/ESP32.git
cd ESP32
npm run setup
```

Nếu repo private, tài khoản GitHub của người nhận cần quyền đọc repo. Nếu đã clone, vào repo chạy `git pull`; chạy lại `npm run setup` khi thư viện/lockfile thay đổi. Không ghi đè thay đổi đang làm dở để kéo code mới.

Chỉ muốn xem giao diện: chạy `npm run dev:fe`, mở URL Local trong terminal, bấm **Xem thử bảng điều khiển**. Chế độ này không cần backend/Firebase và không chứng minh phần cứng đã kết nối.

## 4. Tạo cấu hình local (chỉ khi file chưa tồn tại)

Chạy ở thư mục gốc repo, có `package.json`:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
if (!(Test-Path firmware/powergrid_esp32/secrets.h)) { Copy-Item firmware/powergrid_esp32/secrets.example.h firmware/powergrid_esp32/secrets.h }
```

### Frontend

Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config. Nếu chưa có Web app, thêm ứng dụng Web. Điền vào `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
NEXT_PUBLIC_FIREBASE_APP_ID=<appId>
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Thay toàn bộ phần `<...>` bằng giá trị thật. Bật Email/Password trong Firebase Authentication; thêm `localhost` vào Authorized domains nếu thiếu. Khởi động lại frontend sau khi sửa file này.

### Backend

Lấy credential trong Firebase Console → Project settings → Service accounts → Firebase Admin SDK. Người có quyền tạo/lưu credential riêng cho máy chạy backend, ví dụ `C:/secure/powergrid-service-account.json`.

Điền `backend/.env`:

```dotenv
PORT=4000
HOST=0.0.0.0
FRONTEND_ORIGIN=http://localhost:3000
FIREBASE_PROJECT_ID=<cùng projectId với frontend>
GOOGLE_APPLICATION_CREDENTIALS=C:/secure/powergrid-service-account.json
ACCESS_MODE=registered
ALLOWED_EMAILS=
DEVICE_KEYS_JSON={"light-a":"<khóa thiết bị>"}
```

Tạo khóa riêng bằng lệnh sau, rồi sao chép kết quả vào `<khóa thiết bị>`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mỗi deviceId có một khóa riêng. Khóa trong ESP32 phải trùng khóa của chính deviceId đó trong backend. Với `ACCESS_MODE=registered`, các tài khoản email đăng ký trong project đều dùng chung hai tủ và có quyền xử lý sự cố. Dùng `allowlist` cùng `ALLOWED_EMAILS` nếu cần giới hạn tài khoản.

Tạo Cloud Firestore và kiểm tra rules theo [README](../README.md). Không ghi đè rules của ứng dụng khác trong cùng Firebase project.

## 5. Chạy web và backend

Giữ **hai terminal** mở tại thư mục gốc repo:

Terminal 1:

```powershell
npm run dev:be
```

Terminal 2:

```powershell
npm run dev:fe
```

- Mở `http://localhost:3000` (hoặc URL frontend in trong terminal).
- Đăng ký/đăng nhập tài khoản thật, không chọn chế độ xem thử.
- Mở `http://localhost:4000/health`: kết quả `status: ok` chỉ xác nhận tiến trình API chạy, chưa chứng minh Firestore/cảm biến hoạt động.
- Chưa gửi dữ liệu thì web hiển thị `—`/chưa có dữ liệu; đây là trạng thái bình thường.
- Nếu frontend chuyển sang cổng khác, sửa `FRONTEND_ORIGIN` theo origin mới rồi khởi động lại backend.

## 6. Kết nối phần cứng

Mẫu hiện có dành cho **ESP32 + PZEM-004T v3 một pha**. Người phụ trách phần cứng phải xác nhận board/cảm biến và sửa phần đọc cảm biến nếu dùng loại khác.

1. Cài Arduino IDE, ESP32 board package, thư viện PZEM004Tv30 (mandulaj) và ArduinoJson 7.
2. Mở `firmware/powergrid_esp32/powergrid_esp32.ino`.
3. Trên máy chạy backend, dùng `ipconfig`, lấy IPv4 của Wi-Fi đang dùng, ví dụ `192.168.1.10`.
4. Điền Wi-Fi, DEVICE_ID và DEVICE_KEY vào `secrets.h`.
5. Đặt API_URL trên ESP32 thành `http://192.168.1.10:4000/api/telemetry`, thay IP bằng IP thật. **Không dùng localhost hoặc 0.0.0.0 trong URL ESP32.**
6. ESP32 và máy tính cùng mạng LAN; cho phép cổng backend 4000 trên mạng riêng nếu firewall chặn. Mạng khách có thể chặn thiết bị truy cập lẫn nhau.
7. Chỉnh chân UART theo board thực tế, chọn đúng board/cổng COM rồi nạp. Không dùng sơ đồ mẫu làm hướng dẫn đấu nối điện lưới.
8. Mở Serial Monitor tốc độ 115200. Mẫu gửi mỗi 10 giây; HTTP 202 nghĩa là backend đã chấp nhận mẫu hoặc nhận lại mẫu trùng.

Danh mục thiết bị thật không cố định. Trong `secrets.h`, khai báo `DEVICE_ID`, `DEVICE_NAME`, `CABINET_ID` (`cabinet-1` hoặc `cabinet-2`), `DEVICE_TYPE`, công suất định mức và ngưỡng đo. Thêm cùng deviceId/khóa vào `DEVICE_KEYS_JSON` trong backend rồi khởi động lại backend. Khi ESP32 khởi động, firmware tự gọi `/api/devices/register`; thiết bị xuất hiện trong Firestore `devices` và sơ đồ web sau lượt đồng bộ tiếp theo. Không cần sửa frontend để thêm thiết bị thứ 4, thứ 8 hoặc nhiều hơn.

Sketch mẫu gửi **một thiết bị**; gateway nhiều cảm biến phải khai báo và gửi dữ liệu từng deviceId. Một board không tự nhận biết số lượng/tên/vị trí mọi thiết bị điện. Sơ đồ hiện là phân nhóm thiết bị theo tủ, không phải bản vẽ đấu dây tự động. Thiết bị mất mạng vẫn được giữ trên sơ đồ. Nếu dùng secrets.h cũ, thêm các trường mới theo secrets.example.h trước khi biên dịch.

Ví dụ muốn thêm quạt số 4 vào tủ 1: đặt `DEVICE_ID="fan-04"`, `DEVICE_NAME="Quat so 4"`, `CABINET_ID="cabinet-1"`, `DEVICE_TYPE="fan"`; chọn công suất/ngưỡng đúng thiết bị và cấp khóa riêng cho `fan-04` ở backend. Khởi động ESP32, kiểm tra Registration HTTP 201 (mới) hoặc 200 (đã khai báo), sau đó Telemetry HTTP 202. Khi chưa có thiết bị nào đăng ký, sơ đồ tủ thật hiển thị trống thay vì ba thiết bị mẫu.

Muốn hiển thị số liệu từng thiết bị phải đo riêng từng nhánh. Công tơ tổng chỉ cung cấp số liệu tổng, không tự chia cho từng thiết bị. Không reset kWh mỗi lần gửi. Gói đầu lập mốc; gói thứ hai mới bắt đầu có điện năng chênh lệch.

Nếu IP máy tính đổi khi đổi Wi-Fi/khởi động router, cập nhật API_URL trên ESP32. Triển khai qua Internet cần backend có địa chỉ HTTPS truy cập được và cấu hình CA cho firmware; việc đó khác với chạy LAN trong hướng dẫn này.

## 7. Kiểm tra đã nối thật

1. Serial Monitor có HTTP 202.
2. Firestore xuất hiện `readings/{deviceId}` với timestamp mới.
3. Web đăng nhập thật hiển thị đúng deviceId và trạng thái trực tuyến.
4. Sau nhiều mẫu, `energyDaily` có dữ liệu và điện năng hôm nay xuất hiện.
5. Ngắt đường truyền dữ liệu: web báo mất kết nối sau khi lần đo cũ quá 60 giây và tới lượt cập nhật tiếp theo. Không thử tạo quá tải điện thật để kiểm tra cảnh báo; dùng môi trường mô phỏng/project test.

## 8. Lỗi thường gặp

| Lỗi | Kiểm tra |
|---|---|
| Chưa cấu hình Firebase trên web | Bốn biến Firebase trong `frontend/.env.local`, khởi động lại FE |
| Backend thiếu biến cấu hình | `backend/.env`, chạy đúng thư mục/lệnh |
| Không tìm thấy credential | Đường dẫn JSON là đường dẫn trên máy người nhận; file phải tồn tại |
| Đăng ký được nhưng web không tải số liệu | Backend đang chạy, NEXT_PUBLIC_API_URL đúng, credential/projectId khớp, Firestore đã tạo |
| API 401 khi ESP32 gửi | DEVICE_ID và DEVICE_KEY phải trùng cấu hình backend |
| API 401 khi web gọi | Phiên Firebase hợp lệ, FE và BE cùng Firebase project |
| API 403 | Kiểm tra ACCESS_MODE; nếu allowlist thì kiểm tra ALLOWED_EMAILS |
| ESP32 không kết nối được API | IP LAN, HOST=0.0.0.0, firewall, cùng Wi-Fi, backend đang chạy |
| API 400 về thời gian | ESP32 cần NTP và timestamp đúng UTC |
| API 409 | Mẫu cũ hoặc bước tăng kWh không hợp lý; xem API.md |
| Thiết bị khác vẫn chưa có dữ liệu | Mỗi thiết bị cần gửi mẫu riêng theo deviceId |
| Số liệu hôm nay thiếu sau mất mạng | Khoảng mất dữ liệu trên 15 phút bị bỏ qua theo cách tính hiện tại |

Các thông số/phần cứng chưa được xác nhận thì coi đây là bộ code chuẩn bị tích hợp. Build/test phần mềm không thay thế kiểm thử Firebase và thiết bị thật.
