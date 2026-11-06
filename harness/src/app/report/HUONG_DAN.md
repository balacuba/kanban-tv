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
  HourlyYieldChart.tsx            (mới) – biểu đồ Tỷ lệ đạt / Input, mục tiêu 95%
  yieldPeriods.ts                 (mới) – đếm Input / lỗi theo ngày / tháng / năm cho biểu đồ đó
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
| Công đoạn lỗi của từng SN (bảng SN khi bấm cột Pareto) | `POST {PLANNING_API_URL}/rest/entities/SerialnumberErrorHistory/search` (lọc `workOrderCode`, `createdAt`) |
| Tên lỗi | `POST {MDM_URL}/api/errors` |

- Lọc nhiều ngày: gọi `get-daily-report` cho từng ngày rồi cộng lại (tối đa 31 ngày một lần).
- Tự tải lại mỗi 5 giây (gần thời gian thực; 1 lần tải ~0,5 giây; lần trước chưa xong thì bỏ qua lượt đó; tab / app
  bị ẩn vẫn tải, hiện lại thì tải ngay; đổi ở `REFRESH_MS` trong KanbanShared.tsx), tự chuyển ca ngày 08:00–20:00 / ca đêm 20:00–08:00 theo giờ máy.
- Ô Ca: Tự động / Ca ngày / Ca đêm / Cả 2 ca (08:00 → 08:00 hôm sau, 24 khung giờ: bảng công đoạn, biểu đồ theo giờ,
  Defect Distribution, bảng SN, Excel tính cả ngày sản xuất; file Excel đuôi _Ca2). Ca đêm hiện gần như không có số
  theo giờ vì get-daily-report chỉ chia giờ 6:00–20:00 (xem phần lưu ý backend).
- Bảng Kết quả theo công đoạn hiện đúng số `stageN_pass / stageN_fail` của `detailTable`, theo ca / khung giờ / công đoạn
  đang lọc. Cuối bảng có dòng Tổng (tổng Pass / Fail từng công đoạn trong các khung giờ đang xem). Dưới tên công đoạn:
  số lỗi · tỷ lệ lỗi của chính công đoạn = Fail / (Pass + Fail). Dòng `testTime = "Ngoài khung giờ"` hiện thành dòng
  "Ngoài giờ" (dưới dòng Tổng, không cộng vào tổng) khi có số.
  Bấm vào ô có Fail (TV: chọn ô bằng phím mũi tên rồi OK): mở bảng SN đang NG của công đoạn đó trong khung giờ đó
  (ô dòng Tổng: cả các khung giờ đang xem) — STT, Serial, Thời Gian, Mã Lỗi, Tên Lỗi, Vị Trí, Trạng Thái (không có cột Công
  Đoạn vì đã chọn công đoạn); dòng dưới tiêu đề đếm theo
  tên lỗi. Lấy từ cùng nguồn với Defect Distribution (bản ghi trạm sửa R_xxx) nên số SN = số Fail của ô.
- Ô WO-Line: bấm là xổ danh sách, gõ để lọc, chọn là tải ngay; mở màn tự hiện WO xem lần trước (hoặc WO mới nhất).
- Bộ lọc Model → Tên sản phẩm → Dây chuyền → WO-Line (mỗi ô xếp A→Z kèm số WO; lựa chọn được nhớ cho lần mở sau):
  - Model = trường `note` của PlanningWorkOrder (vd. BAM2510, M6, S3).
  - Tên sản phẩm = productName của WO; chỉ hiện sản phẩm có WO của model đang chọn.
  - Dây chuyền = trường `line` của WO (trống ở nhiều WO thì lấy `groupCode`), vd. SMT, ASSY, PACKING; chỉ hiện các dây
    chuyền có WO của model + sản phẩm đang chọn.
  - Ô WO-Line chỉ còn WO thuộc model + sản phẩm + dây chuyền đang chọn; WO đang xem không còn trong danh sách thì tự tải WO mới nhất.
  - Chọn được nhiều WO: bấm vào mã WO = chỉ xem WO đó (tải ngay); bấm ô vuông trước mã (TV / bàn phím: phím Space) =
    thêm / bỏ WO, đóng danh sách thì tải các WO đã chọn và gộp số liệu (ô Mã WO-Line hiện vd. "2 WO"). Gõ vào ô để tìm
    WO rồi tích (chữ đang gõ giữ nguyên sau khi tích, gõ mã khác để tìm tiếp).
  - Excel xuất đúng phần đang lọc; sheet Tổng quan, mục Bộ lọc ghi Model, Tên sản phẩm, Dây chuyền, các WO đang xem, ngày, ca, khung giờ,
    công đoạn; mục Sản phẩm mỗi WO một dòng.
  - Đã chọn model (hoặc sản phẩm) thì dòng đầu danh sách WO-Line là "Tất cả WO": gộp số liệu mọi WO trong danh sách
    (theo model / sản phẩm / dây chuyền đang chọn) có chạy trong các ngày đang xem. Khi gộp nhiều WO (tự chọn hoặc Tất cả WO) — bảng công đoạn gộp theo tên công đoạn, các số cộng lại, Defect Distribution /
    bảng SN / Excel gồm lỗi của các WO đó; ô Mã WO-Line hiện vd. "BAM2510 · SMT · 2/5 WO" (số WO có chạy / số WO trong bộ lọc); Sản lượng hoàn thành
    (và dự kiến, mục Sản phẩm của Excel) = tổng mọi WO trong bộ lọc, kể cả WO không chạy trong các ngày đang xem; PM Plan mỗi mã sản phẩm một dòng;
    Input = tổng Pass công đoạn đầu của từng WO, Thực tế = tổng Pass tại OutputGroup của từng WO.
  - Tải nhiều WO (cho nhanh và không làm quá tải server):
    - Dò WO có chạy bằng lịch sử test (ProductSerialNumberTestHistory, mỗi lần hỏi 1 bản ghi của các WO còn lại): số lần
      hỏi = số WO có chạy + 1, thay vì get-daily-report từng WO × từng ngày. Mỗi WO có chạy hỏi thêm ngày test đầu / cuối
      để chỉ tải get-daily-report các ngày đó (± 1 ngày) và các ngày từ hôm qua. Bỏ qua WO tạo sau ngày cuối đang xem.
    - Mọi yêu cầu dùng chung tối đa 4 yêu cầu cùng lúc (từ ~6 yêu cầu get-daily-report cùng lúc server đã hay trả 502);
      lỗi 502 / 503 / 504 thì tự gửi lại tối đa 2 lần; get-common-info lỗi thì dùng lại số lần trước.
    - get-daily-report của ngày cũ (trước hôm qua) và get-common-info (1 phút) được giữ lại giữa các lần tìm kiếm, nên tìm
      lại / đổi bộ lọc nhanh; mỗi 5 giây chỉ tải lại ngày từ hôm qua, ngày cũ và WO chưa chạy dò lại mỗi phút.
    - Đo (BAM2510, 31 WO): 1 ngày ~2 giây; 7 ngày ~5 giây lần đầu; 31 ngày ~25 giây lần đầu (11 WO × các ngày chạy,
      phụ thuộc tốc độ get-daily-report của server); tìm lại ~1–4 giây.

## Cách tính

- Input Detail = Pass của công đoạn đầu tiên (`stage0_pass`), như màn cũ.
- Output Detail = `completeQuantity`; Defect Detail = `totalFail` (khi lọc công đoạn thì cộng Fail các công đoạn đang chọn).
- PM Plan: Model = mã sản phẩm, InputGroup = công đoạn đầu, OutputGroup = công đoạn "VMI" (không có thì lấy công đoạn cuối).
  PlanOutput nhập tay, lưu trên trình duyệt theo WO + ngày + ca; "Thực tế" = tổng Pass tại OutputGroup trong ca đang xem.
- Ô Tổng lỗi / Lỗi nhiều nhất / Công đoạn lỗi nhiều nhất tính theo ca (và khung giờ, công đoạn) đang xem; sheet Tổng quan
  của Excel cũng vậy. Tổng lỗi = số SN lỗi (SN khác nhau; 1 SN lỗi nhiều lần / nhiều công đoạn chỉ đếm 1). Số lần lỗi
  = tổng Fail trong ca (= biểu đồ Defect Detail = cột Fail của bảng = tổng Pareto). Không tải được lịch sử test
  thì ô hiện tổng Fail. Excel sheet Tổng quan có cả hai dòng.
- Ô Tổng lỗi có thêm Tỷ lệ lỗi = tổng số lỗi các công đoạn (tổng Fail, = Defect Detail) / Input (Pass công đoạn đầu,
  = Input Detail), cùng ca / khung giờ / công đoạn đang xem; dòng dưới ghi "70 lỗi / 560 input". Excel sheet Tổng quan có
  dòng Tỷ lệ lỗi. Lưu ý: Input chỉ là Pass công đoạn đầu, nên khung giờ công đoạn đầu ít chạy (vd. Input 1, lỗi 1) tỷ lệ cao.
- Biểu đồ "Tỷ lệ đạt / Input" (dưới Defect Detail), nút Theo ngày (mặc định) / Theo tháng / Theo năm / Theo giờ (được nhớ):
  - Cột = Input (trục trái, nới rộng để cột cao nhất chỉ tới ~60% chiều cao, không lẫn với vùng %), đường = tỷ lệ đạt = 1 − lỗi / Input (trục phải, %), đường đứt nét cam = mục tiêu 95%
    (YIELD_TARGET trong HourlyYieldChart.tsx). Đạt khi tỷ lệ đạt ≥ 95% (so theo số làm tròn 0,1% đang hiển thị, nên
    95,0% là đạt): cột và điểm xanh lá; dưới 95%: đỏ (Excel cột Đạt mục tiêu cũng vậy).
  - Theo ngày / tháng / năm TỰ LẤY, không theo bộ lọc ngày / ca / khung giờ / công đoạn (chỉ theo các WO đang xem):
    30 ngày / 12 tháng / 3 năm gần nhất, mỗi kỳ tính theo ngày sản xuất 08:00 → 08:00 hôm sau (cả 2 ca).
    Đếm trên ProductSerialNumberTestHistory bằng `POST /rest/entities/ProductSerialNumberTestHistory/search/count`:
    lỗi = số bản ghi stageName bắt đầu "R_"; Input = số bản ghi preStageName = công đoạn đầu của WO và stageName khác
    "R_<công đoạn đầu>" (đã đối chiếu từng WO và từng ngày: bằng stage0_pass / tổng Fail của get-daily-report; tổng
    các tháng = năm). Mỗi kỳ 1 lần đếm lỗi + 1 lần đếm Input cho mỗi nhóm công đoạn đầu; tối đa 3 lần đếm cùng lúc,
    Theo ngày đếm trước. Kỳ đã qua lưu trên máy (localStorage "kanban-yield-cache"); kỳ hiện tại và kỳ vừa kết thúc
    trong 24 giờ qua đếm lại mỗi phút. Lần đầu Theo ngày ~3–5 giây.
  - Theo giờ: các khung giờ của ca đang xem (theo bộ lọc như các biểu đồ khác).
  - Không có Input thì không có điểm; trục phải cố định 0% – 100%; rê chuột vào
    điểm xem Input, số lỗi, tỷ lệ đạt, tỷ lệ lỗi. Input = Pass công đoạn đầu, nên ngày công đoạn đầu gần như không chạy
    (vd. 29/10: Input 8, lỗi 34) tỷ lệ đạt = 0%.
  - Excel: sheet Theo ngày / Theo tháng / Theo năm (Input, Số lỗi, Tỷ lệ lỗi, Tỷ lệ đạt, Đạt mục tiêu 95% xanh / đỏ),
    sheet Theo giờ có cột Tỷ lệ lỗi / Tỷ lệ đạt, sheet Biểu đồ có ảnh biểu đồ (chế độ đang xem).
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
  - Excel sheet "SN lỗi": mỗi SN một dòng, trong ca / khung giờ / công đoạn đang xem — Số SN, Số lần lỗi, Công đoạn lỗi,
    Thời gian, Mã lỗi, Tên lỗi, Vị trí, Trạng thái (Đang sửa / Đã sửa / OK), Trạm sửa. SN lỗi nhiều lần ghi tất cả các lần
    vào cùng ô (mỗi lần một dòng, các cột thẳng hàng theo từng lần lỗi), tô nền xanh nhạt, xếp lên đầu; dòng Tổng = tổng
    số lần lỗi (= tổng Pareto). Có bộ lọc.
  - Bấm vào cột (TV: chọn cột bằng phím mũi tên rồi OK): mở bảng các lỗi của loại lỗi đó — Số SN, Công đoạn lỗi,
    Thời gian, Mã lỗi, Tên lỗi (lấy từ ProductSerialNumberTestHistory: serialNumber, testTime, errorCode; tên lỗi theo MDM,
    không có thì lấy errorName của SerialnumberErrorHistory), lọc theo ca / khung giờ /
    công đoạn đang xem, mới nhất lên đầu. Không tải được lịch sử test thì không có SN.
    Công đoạn lỗi lấy theo thứ tự:
    1. `SerialnumberErrorHistory.stageName`: lưu riêng từng lần ghi lỗi, không mất khi bắt repair (lịch sử test của SN
       có thể bị xoá). Có dữ liệu từ 02/11/2026 08:12; ghép theo SN + mã lỗi + thời gian lệch ≤ 10 phút.
    2. Dữ liệu trước đó: công đoạn SN được trả về sau sửa (bản ghi kế tiếp có preStageName = trạm sửa, vd. R_OQC → VMI).
    3. Không có cả hai: trạm sửa (R_xxx → xxx).
    Bảng SN (cả bảng mở từ ô công đoạn): cột STT · Serial · Công Đoạn · Thời Gian · Mã Lỗi · Tên Lỗi · Vị Trí · Trạng Thái,
    căn giữa. Vị Trí = note lúc bắn lỗi (SerialnumberErrorHistory.note, vd. U6, R72; ghép cùng bản ghi lấy công đoạn lỗi),
    không ghi note thì hiện "—".
    Trạng Thái lấy từ toàn bộ lịch sử test của các SN lỗi (theo danh sách SN, không giới hạn ngày cuối):
    - Đang sửa: chưa có bản ghi sửa xong (bản ghi có preStageName = trạm sửa R_xxx).
    - Đã sửa: đã sửa xong và trả về công đoạn (repairTime), chưa qua lại công đoạn đó (hoặc test lại vẫn NG).
    - OK: sau lúc sửa xong, SN đã qua lại công đoạn được trả về (bản ghi có preStageName = công đoạn đó, testResult = 1).
    Rê chuột vào ô Trạng Thái xem "Đã sửa, trả về …".

## Lưu ý về dữ liệu backend

- `get-daily-report` đếm `stageN_pass` là số sản phẩm đi tiếp sang công đoạn sau (công đoạn cuối luôn 0).
  Kanban hiện đúng số API; nên đề nghị backend sửa để Pass là số Pass tại chính công đoạn.
- `get-daily-report` chỉ chia giờ 6:00–20:00, ca đêm gần như không có số theo giờ.
