# WO-Line Dashboard (React + CSS)

## Chạy thử

```bash
npm install
npm run dev
```

Hiện trang dùng dữ liệu mẫu trong `src/dashboard/mockData.js`.

## Nối backend

Chỉ cần sửa `src/dashboard/api.js`:

1. Đặt `USE_MOCK = false`.
2. Sửa URL trong `fetchWoLines()` và `fetchDashboard()` cho đúng API.
3. Nếu tên trường backend khác, map lại trong `normalizeDashboard()`.
4. Khi chạy dev, `vite.config.js` chuyển `/api` sang `http://localhost:5000` — đổi theo địa chỉ backend.

Định dạng dữ liệu giao diện cần (khung giờ / công đoạn thiếu được coi là 0):

```js
{
  woCode: "11122610110-1",
  products: [{ name, plan, done }],
  pmPlan:   [{ model, inputGroup, outputGroup, planOutput }],
  stages:   ["SMT-PCB-AOI-TOP", "SMT-PCB-AOI-BOT", ...],   // tối đa ~15
  stageRows: { "8:00-9:00": [[pass, fail], ...] },          // theo đúng thứ tự stages
  inputByHour:  { "9:00-10:00": 28 },
  outputByHour: { "10:00-11:00": 383 },
  defects: [{ name, count, est }]                           // est: số chưa chắc chắn (tùy chọn)
}
```

Khung giờ viết dạng `"H:00-H:00"` không có số 0 đầu, ví dụ `"8:00-9:00"`, `"23:00-0:00"`.

## Ca làm việc

- Ca ngày 08:00–20:00, ca đêm 20:00–08:00 hôm sau — sửa `SHIFTS` trong `constants.js` nếu đổi giờ ca.
- Chế độ **Tự động** kiểm tra giờ mỗi 30 giây; qua mốc đổi ca thì chuyển ca và tải lại dữ liệu
  theo ngày sản xuất (0:00–8:00 thuộc ca đêm của ngày hôm trước).

## Cấu trúc

```
src/dashboard/
  WoLineDashboard.jsx   trang chính, giữ state bộ lọc
  WoLineDashboard.css   toàn bộ style (bọc trong .wo-dash)
  api.js                gọi backend / dữ liệu mẫu
  selectors.js          tính số liệu theo ca, Pareto, tỷ lệ lỗi
  hooks.js              tải dữ liệu, tự chuyển ca, đo kích thước biểu đồ
  constants.js          ca, khung giờ, bảng màu
  components/           FilterBar, KpiCards, InfoTables, ParetoChart, HourChart, StageTable
```
