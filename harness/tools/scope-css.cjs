// Tạo HourlyOutputReport.css từ CSS của bản Kanban React: mọi luật được giới hạn trong .wo-dash
// (tránh đụng CSS của ứng dụng Jmix), chế độ "Xem toàn bộ" gắn class vào khung Kanban thay vì thẻ <html>.
const fs = require("fs");
const path = require("path");
const postcss = require("postcss");

const [src, out] = process.argv.slice(2);
let css = fs.readFileSync(src, "utf8");

// Bỏ luật khóa cuộn cả trang (Kanban nằm trong ứng dụng, không được khóa cuộn của ứng dụng)
css = css.replace(/html\.wd-fit, html\.wd-fit body \{ overflow: hidden; \}\r?\n/, "");

const root = postcss.parse(css);
root.walkRules(rule => {
  if (rule.parent && rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map(sel => {
    sel = sel.trim();
    // Nhãn của ô lọc chỉ là nhãn con trực tiếp của .field (không lan vào các dòng trong danh sách công đoạn);
    // kiểu ô nhập không áp cho checkbox
    sel = sel.replace(/\.field label\b/g, ".field > label").replace(/\.field input(?![\w-\[:])/g, '.field input:not([type="checkbox"])');
    if (sel.startsWith("html.wd-fit")) {
      const rest = sel.slice("html.wd-fit".length).trim().replace(/^\.wo-dash\b\s*/, "");
      return rest ? `.wo-dash.wd-fit ${rest}` : ".wo-dash.wd-fit";
    }
    if (sel.startsWith(".wo-dash")) return sel;
    return `.wo-dash ${sel}`;
  });
});

const header = `/* Kanban – màn HourlyOutputReport.
   Mọi luật đều nằm trong .wo-dash để không ảnh hưởng (và không bị ảnh hưởng bởi) CSS khác của ứng dụng. */
`;

const extra = `
/* ================= Bổ sung cho bản tích hợp vào ứng dụng ================= */
/* Kanban nằm trong khung màn hình của ứng dụng: cao tối thiểu bằng khung chứa thay vì cả cửa sổ;
   căn trái mặc định để không thừa hưởng kiểu căn giữa của khung chứa (các phần cần căn giữa đã tự đặt) */
.wo-dash { min-height: 100%; text-align: left; }
/* Khung thẻ không bao giờ hiện thanh cuộn dọc (nội dung luôn quyết định chiều cao thẻ; lệch làm tròn 1px khi
   phóng to / thu nhỏ màn hình hoặc Windows scale 125–150% từng làm hiện thanh cuộn ở PM Plan). Chỉ giữ cuộn ngang
   cho bảng rộng trên màn hình nhỏ. */
.wo-dash .card-body { overflow-x: auto; overflow-y: hidden; }
.wo-dash .info-card .card-body { overflow: hidden; }
.wo-dash .info-card .card-body:has(.info-table) { overflow-x: auto; overflow-y: hidden; }
/* Thân thẻ Sản phẩm / PM Plan giãn theo thẻ bên cạnh nhưng không bao giờ co nhỏ hơn nội dung: khi thẻ không được kéo
   giãn (màn hẹp, thẻ đứng riêng một hàng, hoặc CSS của ứng dụng đổi cách căn hàng) "flex: 1" + overflow hidden làm thân
   thẻ co về 0 và mất tên sản phẩm */
.wo-dash .info-card .card-body { flex: 1 0 auto; }
/* Thẻ Sản phẩm: thân thẻ luôn hiện và luôn đủ cao cho tên sản phẩm, kể cả khi CSS của ứng dụng chứa Kanban đặt
   .card-body / bảng ẩn đi, cao 0 hoặc cắt nội dung (đã gặp trên server khác: thẻ chỉ còn tiêu đề) */
.wo-dash .info-row .info-card.product { display: flex !important; flex-direction: column !important; height: auto !important; }
.wo-dash .info-row .info-card.product > .product-body {
  display: flex !important; flex: 1 0 auto !important; align-items: center; justify-content: center;
  min-height: 64px !important; height: auto !important; max-height: none !important;
  overflow: visible !important; visibility: visible !important; opacity: 1 !important;
  padding: 8px 12px !important; position: static !important; transform: none !important;
}
.wo-dash .info-row .info-card.product .product-name {
  display: block !important; width: 100%; text-align: center; visibility: visible !important; opacity: 1 !important;
}
.wo-dash .info-row .info-card.product .product-badge { display: inline-block !important; visibility: visible !important; }
.wo-dash .info-row .info-card.product .product-empty { color: var(--muted); font-style: italic; font-size: 14px; }
/* Đưa tiêu đề về kiểu của Kanban (ứng dụng có thể đặt màu/khoảng cách riêng cho h1, h2) */
.wo-dash h1, .wo-dash h2 { color: inherit; margin: 0; line-height: 1.3; }
.wo-dash .wd-header .brand-name { line-height: 1; }
/* Khi bấm "Xem toàn bộ", khung Kanban được đưa ra toàn màn hình */
.wo-dash:fullscreen { overflow: auto; background: var(--page); }
/* Ô chọn WO-Line: ô nhập + nút mũi tên, bấm là xổ danh sách (gõ để lọc) */
.wo-dash .wo-combo { position: relative; }
.wo-dash .field input.wo-input { width: 210px; padding-right: 32px; }
.wo-dash .wo-combo-btn {
  position: absolute; top: 1px; right: 1px; width: 30px; height: calc(var(--ctl-h) - 2px);
  border: 0; border-radius: 0 8px 8px 0; background: transparent var(--chevron) no-repeat center / 12px; cursor: pointer;
  transition: transform .15s;
}
.wo-dash .wo-combo-btn.open { transform: rotate(180deg); }
.wo-dash .wo-menu {
  position: absolute; left: 0; top: calc(var(--ctl-h) + 4px); z-index: 30; min-width: 100%; width: 260px; max-height: 320px;
  overflow: auto; margin: 0; padding: 4px; list-style: none;
  background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .12);
}
.wo-dash .wo-menu li {
  padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.wo-dash .wo-menu li.hi { background: #fdf0e3; }
.wo-dash .wo-menu li.sel { font-weight: 700; color: #0b4596; }
.wo-dash .wo-menu li.none { color: var(--muted); cursor: default; }
/* Dòng "Ngoài giờ": dữ liệu ngoài khung giờ ca, hiện riêng dưới dòng tổng, chữ nghiêng màu nhạt */
.wo-dash .stage-table tr.outside td { background: #fafafa; font-style: italic; }
.wo-dash .stage-table tr.outside td.time { background: #f1f3f5; color: #7a808a; }
/* Danh sách chọn công đoạn: đặt đủ kiểu (căn trái, checkbox cùng hàng với tên) để CSS chung của ứng dụng
   (label dạng khối, chữ căn giữa, checkbox dạng khối...) không làm vỡ bố cục */
.wo-dash .filters .multi-menu { text-align: left; }
.wo-dash .filters .field > label { display: block; float: none; width: auto; text-align: left; line-height: 1.3; }
.wo-dash .filters .multi-menu label {
  display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 8px;
  width: auto; float: none; margin: 0; padding: 6px 8px; text-align: left;
  font-size: 13px; font-weight: 400; line-height: 1.35; letter-spacing: normal; text-transform: none;
  color: var(--text); white-space: normal; cursor: pointer;
}
.wo-dash .filters .multi-menu label.all { font-weight: 600; }
.wo-dash .filters .multi-menu input[type="checkbox"] {
  display: inline-block; flex: none; position: static; float: none; opacity: 1; visibility: visible;
  width: 16px; height: 16px; min-width: 16px; margin: 0; padding: 0; border: 0; box-shadow: none;
  -webkit-appearance: checkbox; appearance: auto; accent-color: var(--accent); vertical-align: middle;
}
/* Bảng công đoạn: dưới tên công đoạn là "số lỗi · % trên tổng lỗi của ca"; công đoạn có lỗi tô vàng nổi trên nền xanh */
.wo-dash .stage-table thead th.stage .stage-share {
  display: block; margin-top: 3px; font-size: 11px; font-weight: 600; letter-spacing: 0; text-transform: none;
  color: rgba(255, 255, 255, .72); white-space: nowrap; font-variant-numeric: tabular-nums;
}
.wo-dash .stage-table thead th.stage .stage-share.hit { color: #ffe08a; font-weight: 800; }
.wo-dash .stage-table.dense thead th.stage .stage-share { font-size: 9.5px; white-space: normal; }
/* Ô chọn WO-Line: các dòng trong danh sách cũng căn trái */
.wo-dash .wo-menu, .wo-dash .wo-menu li { text-align: left; }

/* Defect Distribution: phạm vi dữ liệu lỗi (đậm) + cảnh báo khi bộ lọc không áp dụng được (cam) */
.wo-dash .legend .scope { color: var(--text); font-weight: 600; }
.wo-dash .legend .rate-line { color: #b3261e; font-weight: 700; }
.wo-dash .legend .note { color: #b45309; font-weight: 600; background: #fff7e6; border-radius: 6px; padding: 1px 8px; }
/* Pareto: bấm vào cột mở bảng SN lỗi (bảng nổi giữa màn hình, không làm xô bố cục) */
.wo-dash .pareto-hit { cursor: pointer; outline: none; }
.wo-dash .sn-backdrop {
  position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
  background: rgba(15, 23, 42, .45); padding: 24px;
}
.wo-dash .sn-panel {
  width: min(920px, 96vw); max-height: 86vh; display: flex; flex-direction: column; text-align: left;
  background: #fff; border-radius: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, .3); overflow: hidden;
}
.wo-dash .sn-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border); background: #fafbfd; }
.wo-dash .sn-dot { width: 14px; height: 14px; border-radius: 4px; flex: none; }
.wo-dash .sn-title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.wo-dash .sn-title b { font-size: 18px; color: var(--text); }
.wo-dash .sn-title small { font-size: 13px; color: var(--muted); }
.wo-dash .sn-close {
  flex: none; height: 36px; padding: 0 16px; border: 1px solid var(--border); border-radius: 8px;
  background: #fff; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer;
}
.wo-dash .sn-close:hover, .wo-dash .sn-close:focus { border-color: var(--accent); color: var(--accent); outline: none; }
.wo-dash .sn-scroll { overflow: auto; }
.wo-dash .sn-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.wo-dash .sn-table th {
  position: sticky; top: 0; background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .03em; text-align: left; padding: 9px 14px; border-bottom: 1px solid var(--border);
}
.wo-dash .sn-table td { padding: 8px 14px; border-bottom: 1px solid #eef1f5; color: var(--text); }
.wo-dash .sn-table tr:nth-child(even) td { background: #fafbfc; }
.wo-dash .sn-table td.num { font-variant-numeric: tabular-nums; color: #64748b; white-space: nowrap; }
.wo-dash .sn-table td.sn { font-family: Consolas, "Roboto Mono", monospace; font-weight: 700; letter-spacing: .02em; }
.wo-dash .sn-repairing { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: #fff4e5; color: #b45309; font-size: 11px; font-weight: 700; white-space: nowrap; }
.wo-dash .sn-stage { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #fdecec; color: #b3261e; font-weight: 700; font-size: 12.5px; }
.wo-dash .sn-empty { padding: 28px 18px; color: var(--muted); text-align: center; }
/* Điện thoại: bảng SN vừa màn hình — bỏ cột # và Mã lỗi (đã có tên loại lỗi trên đầu bảng), thu gọn khoảng cách */
@media (max-width: 560px) {
  .wo-dash .sn-backdrop { padding: 10px; align-items: flex-start; padding-top: 56px; }
  .wo-dash .sn-panel { width: 100%; max-height: calc(100vh - 70px); }
  .wo-dash .sn-head { padding: 10px 12px; gap: 8px; }
  .wo-dash .sn-title b { font-size: 16px; }
  .wo-dash .sn-close { height: 32px; padding: 0 12px; font-size: 13px; }
  .wo-dash .sn-table { font-size: 12.5px; }
  .wo-dash .sn-table th, .wo-dash .sn-table td { padding: 7px 6px; }
  .wo-dash .sn-table th:first-child, .wo-dash .sn-table td:first-child,
  .wo-dash .sn-table th:last-child, .wo-dash .sn-table td:last-child { display: none; }
  .wo-dash .sn-table td.sn { letter-spacing: 0; word-break: break-all; }
  .wo-dash .sn-stage { padding: 2px 7px; font-size: 11.5px; }
}
@media (max-width: 820px) {
  .wo-dash .field input.wo-input { width: 100%; }
}
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header + root.toString() + extra, "utf8");
console.log("wrote", out);
