# Kanban – màn HourlyOutputReport (bản tích hợp)

Giao diện Kanban mới, nối với đúng các API của màn HourlyOutputReport cũ.

## Chép vào dự án

Giữ nguyên cấu trúc thư mục cũ, chép đè vào thư mục đang chứa `HourlyOutputReport.tsx`:

```
HourlyOutputReport.tsx            (thay file cũ)
HourlyOutputReport.css            (thay file cũ)
mkvision-logo.png                 (mới – logo trên thanh tiêu đề)
chart/hourlyOutput/
  HourlyOutputPieChart.tsx        (thay file cũ) – tên lỗi từ MDM + khối Defect Distribution
  ErrorParetoChart.tsx            (thay file cũ) – biểu đồ Pareto nằm ngang
  HourlyPassOutputChart.tsx       (thay file cũ) – Input Detail
  HourlyCompleteOutputChart.tsx   (thay file cũ) – Output Detail
  HourlyFailOutputChart.tsx       (thay file cũ) – Defect Detail
  KanbanShared.tsx                (mới) – ca làm việc, đa ngôn ngữ, biểu đồ theo giờ, hook dùng chung
  KanbanExcel.ts                  (mới) – xuất Excel
```

Cài thêm thư viện xuất Excel (một lần):

```
npm install exceljs
```

Không còn dùng DevExtreme (DataGrid, Chart, SelectBox, DateBox, LoadPanel) trong màn này. Các thư viện còn dùng
giống màn cũ: `axios`, `react-toastify`, `@haulmont/jmix-react-core`, `@haulmont/jmix-react-ui`, `../../config`.

Token: màn này dùng token của người đang đăng nhập (`mainStore.authToken`) như màn cũ, không cần cấu hình thêm.
Không đưa tài khoản / mật khẩu / client_secret vào code giao diện.

## API (giữ nguyên như màn cũ, thêm 1 API cho Defect Distribution)

| Dữ liệu | API |
|---|---|
| Danh sách WO-Line | `POST {PLANNING_API_URL}/rest/entities/PlanningWorkOrder/search` |
| Sản phẩm, sản lượng, danh sách công đoạn | `GET .../production-report/get-common-info/{wo}` |
| Bảng theo giờ, lỗi theo giờ, hoàn thành theo giờ, danh sách lỗi | `POST .../production-report/get-daily-report?workOrderCode={wo}&date={yyyy-MM-dd}` |
| Lỗi theo công đoạn / giờ (cho Defect Distribution) | `POST {PLANNING_API_URL}/rest/entities/ProductSerialNumberTestHistory/search` (lọc `workOrderCode`, `testTime`, `errorCode` có giá trị) |
| Tên lỗi | `POST {MDM_URL}/api/errors` |

- Lọc nhiều ngày: gọi `get-daily-report` cho từng ngày rồi cộng lại (tối đa 31 ngày một lần).
- Tự tải lại mỗi 30 giây (như màn cũ), tự chuyển ca ngày 08:00–20:00 / ca đêm 20:00–08:00 theo giờ máy.
- Bảng Kết quả theo công đoạn hiện đúng số `stageN_pass / stageN_fail` của `detailTable`, theo ca / khung giờ / công đoạn
  đang lọc. Cuối bảng có dòng Tổng (tổng Pass / Fail từng công đoạn trong các khung giờ đang xem). Dưới tên công đoạn:
  số lỗi · tỷ lệ lỗi của chính công đoạn = Fail / (Pass + Fail). Dòng `testTime = "Ngoài khung giờ"` hiện thành dòng
  "Ngoài giờ" (dưới dòng Tổng, không cộng vào tổng) khi có số.
- Ô WO-Line: bấm là xổ danh sách, gõ để lọc, chọn là tải ngay; mở màn tự hiện WO xem lần trước (hoặc WO mới nhất).

## Cách tính

- Input Detail = Pass của công đoạn đầu tiên (`stage0_pass`), như màn cũ.
- Output Detail = `completeQuantity`; Defect Detail = `totalFail` (khi lọc công đoạn thì cộng Fail các công đoạn đang chọn).
- PM Plan: Model = mã sản phẩm, InputGroup = công đoạn đầu, OutputGroup = công đoạn "VMI" (không có thì lấy công đoạn cuối).
  PlanOutput nhập tay, lưu trên trình duyệt theo WO + ngày + ca; "Thực tế" = tổng Pass tại OutputGroup trong ca đang xem.
- Ô Tổng lỗi / Lỗi nhiều nhất / Công đoạn lỗi nhiều nhất tính theo ca (và khung giờ, công đoạn) đang xem; sheet Tổng quan
  của Excel cũng vậy. Tổng lỗi = tổng Fail trong ca (= biểu đồ Defect Detail = cột Fail của bảng).
- Không còn Tỷ lệ lỗi = lỗi / (OK + lỗi): số OK lấy từ Pass công đoạn đầu không tin cậy (khi công đoạn đầu ít chạy,
  vd. 4 Pass, tỷ lệ lên 66.7%), nên đã bỏ ở ô KPI, biểu đồ và Excel.
- Defect Distribution lọc theo ca, khung giờ, công đoạn đang xem: chỉ đếm bản ghi ProductSerialNumberTestHistory
  tại trạm sửa "R_xxx" (tính vào công đoạn "xxx"), cùng cách đếm với cột Fail của bảng công đoạn, nên tổng Pareto
  khi lọc công đoạn / khung giờ = tổng Fail trong bảng. Bản ghi test NG tại chính công đoạn không đếm (tránh trùng).
  Không tải được lịch sử test thì biểu đồ dùng errorList cả ngày và hiện dòng cảnh báo.
- errorList của get-daily-report đếm cả bản ghi test NG lẫn bản ghi sửa nên lớn hơn tổng Fail; Kanban dùng tổng Fail
  (chỉ dùng errorList khi không tải được lịch sử test).
- Defect Distribution vẽ theo mẫu Pareto (cột + đường % tích lũy chung một khung, mỗi loại lỗi một màu), tính như bảng
  Pareto trên Excel:
  - Trong cột: số lỗi. Dưới chân cột: tỉ lệ = số lỗi / tổng lỗi.
  - Số trên mỗi điểm: tích lũy = số lỗi cộng dồn / tổng lỗi; điểm cuối = 100%.
    Vd. 6 / 2 / 1 / 1 lỗi (tổng 10) → tỉ lệ 60% / 20% / 10% / 10%, tích lũy 60 / 80 / 90 / 100%.
    Mỗi số làm tròn riêng 0.1% (lỗi cùng số lượng có cùng tỉ lệ); khi số lẻ, cộng tay các tỉ lệ có thể lệch 0.1%.
  - Trục trái = số lỗi 0 → tổng lỗi, trục phải = % tích lũy 0–100%; hai trục thẳng hàng nên mỗi điểm đọc được cả
    số lỗi cộng dồn (trái) lẫn % tích lũy (phải). Đường bắt đầu từ lỗi đầu tiên.
  - Rê chuột: hạng, tên lỗi, số lỗi, tỉ lệ, tích lũy. Excel sheet Pareto có các cột Số lỗi / Tỷ lệ / Tích lũy.

## Lưu ý về dữ liệu backend

- `get-daily-report` đếm `stageN_pass` là số sản phẩm đi tiếp sang công đoạn sau (công đoạn cuối luôn 0).
  Kanban hiện đúng số API; nên đề nghị backend sửa để Pass là số Pass tại chính công đoạn.
- `get-daily-report` chỉ chia giờ 6:00–20:00, ca đêm gần như không có số theo giờ.
