# Kanban MKV – ứng dụng cho Google TV / Android TV

File cài đặt: **KanbanTV.apk** (khoảng 0,9 MB). Chạy được trên Android 5.0 trở lên: Google TV, Android TV, TV box
Android, cả máy tính bảng.

## 1. Cài lên TV

TV cần nối mạng nội bộ, mạng đó phải vào được máy chủ `14.241.68.10`.

**Cách A – USB (dễ nhất)**
1. Chép `KanbanTV.apk` vào USB, cắm vào TV.
2. Trên TV: *Cài đặt → Hệ thống → Giới thiệu → Bản dựng Android TV OS*, bấm OK 7 lần để bật chế độ nhà phát triển
   (Google TV đời mới: *Cài đặt → Hệ thống → Giới thiệu → Bản dựng*).
3. Cài một ứng dụng quản lý file từ Google Play (ví dụ *File Commander* hoặc *X-plore*), mở USB, chọn `KanbanTV.apk`.
   Lần đầu TV hỏi quyền "Cài ứng dụng không rõ nguồn gốc" cho ứng dụng quản lý file: bật cho phép rồi cài.

**Cách B – qua mạng bằng ứng dụng Downloader**
1. Cài *Downloader* (AFTVnews) từ Google Play trên TV, cho phép nó cài ứng dụng không rõ nguồn gốc.
2. Đặt `KanbanTV.apk` lên một máy chủ web nội bộ, nhập địa chỉ đó vào Downloader rồi cài.

**Cách C – ADB từ máy tính (cài nhiều TV)**
1. Trên TV: bật chế độ nhà phát triển như trên, rồi bật *Gỡ lỗi USB / Gỡ lỗi qua mạng (ADB)*.
2. Trên máy tính có Android SDK (`platform-tools`):
   ```
   adb connect <địa-chỉ-IP-của-TV>
   adb install -r KanbanTV.apk
   ```

Sau khi cài, ứng dụng **Kanban MKV** nằm trong danh sách ứng dụng của TV (có banner MK Vision).

## 2. Tài khoản

**Bản 1.1 có tài khoản cố định**: cài xong mở app là vào thẳng Kanban, không phải đăng nhập trên TV.

- Tài khoản lấy từ `khoa-ky/account.properties` (`KANBAN_USERNAME`, `KANBAN_PASSWORD`) lúc build. Không có file này,
  hoặc file chưa có mật khẩu, thì app hỏi đăng nhập trên TV như bản 1.0.
- Ứng dụng tự lấy và gia hạn token, hết hạn thì tự đăng nhập lại.
- Đổi mật khẩu tài khoản trên máy chủ: sửa `account.properties`, build lại, cài đè lên các TV. TV nào chưa cài lại sẽ
  hiện màn đăng nhập để nhập mật khẩu mới ngay trên TV.
- Menu → *Đổi tài khoản / máy chủ*: tài khoản nhập trên TV được mã hóa bằng Android Keystore và dùng thay cho tài khoản
  cố định.
- **Lưu ý bảo mật:** mật khẩu trong APK chỉ được mã hóa XOR (không đọc được bằng mắt), người biết giải nén APK vẫn lấy
  ra được. Dùng tài khoản chỉ có quyền xem báo cáo, chỉ phát APK trong nội bộ, giữ kín thư mục `khoa-ky`.
- **Cài đặt máy chủ ▾** (trên màn đăng nhập) dùng để đổi địa chỉ khi máy chủ thay đổi. Mặc định:

  | Mục | Mặc định |
  |---|---|
  | Máy chủ Planning | `http://14.241.68.10:3000` |
  | Máy chủ MDM (tên lỗi) | `http://14.241.68.10:10068` |
  | Địa chỉ lấy token | `http://14.241.68.10:8800/auth/realms/QLSX/protocol/openid-connect/token` |
  | Client ID | `planning_react` (client công khai, không cần secret) |

## 3. Dùng trên TV

- Kanban tự mở WO-Line xem lần trước (hoặc WO mới nhất), tự tải lại mỗi 30 giây, tự chuyển ca ngày / ca đêm.
  Màn hình TV không tự tắt khi đang hiện Kanban.
- Remote: **phím mũi tên** chuyển giữa các nút / ô, **OK** để bấm. Đổi WO: mở bộ lọc, chọn ô WO-Line, gõ
  hoặc dùng ↑↓ chọn, OK.
- Phím **Back** hoặc **Menu** mở bảng chọn: *Tải lại* · *Đổi tài khoản / máy chủ* · *Thoát ứng dụng*.
- Bản TV không có nút xuất Excel (TV không lưu file được). Xuất Excel trên máy tính như cũ.

## 4. Cập nhật phiên bản sau

- Bản mới phải ký bằng **cùng khóa** (`khoa-ky/kanbantv-release.jks`) mới cài đè được lên bản cũ, giữ nguyên tài khoản
  đã lưu. Mất khóa thì phải gỡ app cũ trên từng TV rồi cài lại.
- Giữ kín thư mục `khoa-ky`: file `keystore.properties` chứa mật khẩu của khóa. Không gửi kèm khi phát APK.
- Build lại (máy đã cài JDK 17 + Android SDK):
  ```
  node node_modules\vite\bin\vite.js build --config tv\vite.config.js
  cd android-tv
  set KANBAN_ACCOUNT_FILE=<đường-dẫn>\khoa-ky\account.properties
  gradlew.bat assembleRelease
  ```
  APK ra ở `android-tv\app\build\outputs\apk\release\app-release.apk`. Tăng `versionCode` trong
  `app/build.gradle` mỗi lần phát bản mới.

## 5. Cấu trúc mã nguồn

```
tv/                     bản web Kanban cho TV (dùng chung các file TSX của màn HourlyOutputReport)
  vite.config.js        build ra android-tv/app/src/main/assets/web
  src/main.tsx          mở Kanban, bật "Xem toàn bộ", điều khiển bằng phím mũi tên
  src/bridge-axios.ts   thay axios: request đi qua ứng dụng Android
  src/config.ts         PLANNING_API_URL = "@planning", MDM_URL = "@mdm"
  src/jmix-stubs.ts     thay Jmix / react-toastify
android-tv/             dự án Android (Java)
  MainActivity.java     WebView + gọi API (gắn token, tự thử lại khi 401), phím Back/Menu
  LoginActivity.java    màn đăng nhập + cài đặt máy chủ
  Auth.java             lấy / gia hạn token Keycloak (grant_type=password, client planning_react)
  Prefs.java            lưu cài đặt; mật khẩu mã hóa AES-GCM bằng Android Keystore
```

Cách gọi API: trang web gọi `AndroidApi.prepare(id, method, url, body)` rồi `fetch("api/<id>")`. Ứng dụng đổi `@planning` /
`@mdm` thành địa chỉ máy chủ, gọi API kèm `Authorization: Bearer <token>` và trả nguyên kết quả cho trang. Token không
đi vào trang web. Gọi từ ứng dụng nên không bị chặn CORS như khi chạy trên trình duyệt.
