// Xuất đúng những gì đang hiển thị (theo ca, khung giờ, công đoạn đang lọc) ra file .xlsx.
import { rangeLabel } from "./constants";

// exceljs được tải khi bấm nút để trang không phải tải thư viện này ngay từ đầu.

const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF0E3" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F6F8" } };
const MAIN_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EEFB" } };
const LINE = { style: "thin", color: { argb: "FFD9DCE1" } };
const BORDERS = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const RED = { argb: "FFD63B3B" };
const PCT = "0.0%";

function boxRow(row, { head = false, total = false } = {}) {
  row.eachCell({ includeEmpty: true }, c => {
    c.border = BORDERS;
    if (head) {
      c.fill = HEAD_FILL;
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    if (total) {
      c.fill = TOTAL_FILL;
      c.font = { ...c.font, bold: true };
    }
  });
}

function addSection(ws, title) {
  const r = ws.addRow([title]);
  r.font = { bold: true, size: 12, color: { argb: "FF1F4E9C" } };
  return r;
}

function addTable(ws, header, rows, { total } = {}) {
  boxRow(ws.addRow(header), { head: true });
  rows.forEach(r => boxRow(ws.addRow(r)));
  if (total) boxRow(ws.addRow(total), { total: true });
}

// ---------- Sheet 1: Tổng quan ----------
function sheetOverview(wb, x) {
  const { t, st } = x;
  const ws = wb.addWorksheet(t("xl.overview"));
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 22 }];

  const title = ws.addRow([`Kanban – WO ${x.data.woCode}`]);
  title.font = { bold: true, size: 16, color: { argb: "FF0B4596" } };
  ws.addRow([]);

  addSection(ws, t("xl.filters"));
  [
    [t("xl.prodDate"), rangeLabel(x.dateRange)],
    [t("xl.shift"), `${st.shift} (${x.shiftRangeText})`],
    [t("xl.hours"), `${x.fromLabel} – ${x.toLabel}`],
    [t("xl.stages"), x.stageNames.length === x.data.stages.length ? t("xl.all") : x.stageNames.join(", ")],
    [t("xl.paretoStage"), x.paretoStage || t("xl.all")],
    [t("xl.exportedAt"), new Date().toLocaleString(x.locale)],
  ].forEach(r => boxRow(ws.addRow(r)));
  ws.addRow([]);

  addSection(ws, t("xl.defectSummary"));
  const top = x.pareto.items[0];
  const kpis = [
    [t("xl.totalDay"), x.pareto.total],
    [t("xl.rate"), x.defectRate],
    [t("xl.failAt", st), x.view.totalFail],
    [t("xl.topDefect"), top ? `${top.name} (${top.count})` : "—"],
    [t("xl.topStage"), x.topStage ? `${x.topStage.name} (${x.topStage.fail})` : t("xl.noFail")],
  ];
  kpis.forEach(r => boxRow(ws.addRow(r)));
  ws.getCell(`B${ws.rowCount - 3}`).numFmt = PCT;
  ws.addRow([]);

  addSection(ws, t("xl.products"));
  addTable(ws, [t("xl.productName"), t("xl.plan"), t("xl.done"), t("xl.doneRate")],
    x.data.products.map(p => [p.name, p.plan, p.done, p.plan ? p.done / p.plan : 0]));
  for (let i = 0; i < x.data.products.length; i++) ws.getCell(`D${ws.rowCount - i}`).numFmt = PCT;
  ws.addRow([]);

  addSection(ws, `PM Plan (${st.shift})`);
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 12;
  // Dòng đầu tiên dùng PlanOutput người dùng nhập + sản lượng thực tế của ca
  addTable(ws, ["Model Name", "InputGroup", "OutputGroup", "PlanOutput", t("xl.actual", st), t("xl.achieved")],
    x.data.pmPlan.map((p, i) => i === 0
      ? [p.model, p.inputGroup, p.outputGroup, x.planOutput, x.shiftOutput, x.planOutput ? x.shiftOutput / x.planOutput : ""]
      : [p.model, p.inputGroup, p.outputGroup, p.planOutput, "", ""]));
  ws.getCell(`F${ws.rowCount - x.data.pmPlan.length + 1}`).numFmt = PCT;
}

// ---------- Sheet 2: Kết quả theo công đoạn (mỗi công đoạn 2 cột Pass / Fail) ----------
function sheetStages(wb, x) {
  const { t } = x;
  const ws = wb.addWorksheet(t("xl.stageSheet"), { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  const n = x.stageNames.length;
  ws.columns = [{ width: 14 }, ...x.stageNames.flatMap(() => [{ width: 10 }, { width: 8 }])];

  const h1 = ws.addRow([t("xl.time"), ...x.stageNames.flatMap(s => [s, ""])]);
  const h2 = ws.addRow(["", ...x.stageNames.flatMap(() => ["Pass", "Fail"])]);
  ws.mergeCells(1, 1, 2, 1);
  for (let j = 0; j < n; j++) ws.mergeCells(1, 2 + j * 2, 1, 3 + j * 2);
  boxRow(h1, { head: true });
  boxRow(h2, { head: true });

  const addLine = (label, cells, total) => {
    const row = ws.addRow([label, ...cells.flat()]);
    boxRow(row, { total });
    cells.forEach(([, f], j) => { if (f > 0) row.getCell(3 + j * 2).font = { bold: true, color: RED }; });
  };
  x.view.rows.forEach(({ slot, cells }) => addLine(slot, cells));
  addLine(t("xl.shiftTotal", x.st), x.view.totals, true);
}

// ---------- Sheet 3: Pareto lỗi ----------
function sheetPareto(wb, x) {
  const { t } = x;
  const ws = wb.addWorksheet(t("xl.paretoSheet"), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 6 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 14 }];
  boxRow(ws.addRow(["#", t("xl.defectType"), t("xl.count"), t("xl.share"), t("xl.cum"), t("xl.mainGroup"), t("xl.note")]), { head: true });
  const pv = x.paretoView ?? x.pareto; // Pareto đang xem (có thể đã lọc theo công đoạn)
  pv.items.forEach((d, i) => {
    const row = ws.addRow([i + 1, d.name, d.count, d.share, d.cum, d.main ? t("xl.yes") : "", d.est ? t("xl.est") : ""]);
    boxRow(row);
    row.getCell(4).numFmt = PCT;
    row.getCell(5).numFmt = PCT;
    if (d.main) row.eachCell(c => { c.fill = MAIN_FILL; });
  });
  const total = ws.addRow(["", x.paretoStage ? `${t("xl.total")} (${x.paretoStage})` : t("xl.total"), pv.total, 1, "", "", ""]);
  boxRow(total, { total: true });
  total.getCell(4).numFmt = PCT;
}

// ---------- Sheet 4: Số liệu theo giờ ----------
function sheetHourly(wb, x) {
  const { t } = x;
  const ws = wb.addWorksheet(t("xl.hourSheet"), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 10 }];
  const v = x.view;
  addTable(ws, [t("xl.hours"), t("xl.input"), t("xl.output"), t("xl.count")],
    v.rows.map(({ slot }, k) => [slot, v.input[k], v.output[k], v.failByHour[k]]),
    { total: [t("xl.total"), v.input.reduce((a, b) => a + b, 0), v.output.reduce((a, b) => a + b, 0), v.totalFail] });
}

// ---------- Sheet 5: Biểu đồ (ảnh chụp từ trang) ----------
// exceljs không tạo được biểu đồ Excel gốc, nên chèn ảnh PNG của chính các biểu đồ đang hiển thị.
const ROW_PX = 20; // chiều cao dòng mặc định của Excel (≈ 15pt)

function placeImage(wb, ws, chart, col, row, maxWidth) {
  const w = Math.min(maxWidth, chart.width);
  const h = Math.round(chart.height * (w / chart.width));
  // Mỗi ảnh chỉ nhúng vào file một lần, dùng lại cho các sheet khác để file nhẹ hơn
  chart.imageId ??= wb.addImage({ base64: chart.base64, extension: "png" });
  const id = chart.imageId;
  ws.addImage(id, { tl: { col, row }, ext: { width: w, height: h } });
  return Math.ceil(h / ROW_PX);
}

function sheetCharts(wb, x) {
  if (!x.charts?.length) return;
  const ws = wb.addWorksheet(x.t("xl.chartSheet"));
  ws.getColumn(1).width = 4;
  let row = 1;
  const title = ws.getCell(row, 2);
  title.value = `${x.t("xl.chartTitle")} – WO ${x.data.woCode} – ${rangeLabel(x.dateRange)} – ${x.st.shift}`;
  title.font = { bold: true, size: 14, color: { argb: "FF0B4596" } };
  row += 2;
  for (const c of x.charts) {
    const cell = ws.getCell(row, 2);
    cell.value = c.title;
    cell.font = { bold: true, size: 12, color: { argb: "FF1F6F66" } };
    row += 1;
    row += placeImage(wb, ws, c, 1, row - 1 + 0.2, c.key === "pareto" ? 1100 : 760) + 2;
  }
}

export async function exportDashboardExcel(x) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kanban";
  wb.created = new Date();

  sheetOverview(wb, x);
  sheetStages(wb, x);
  sheetPareto(wb, x);
  sheetHourly(wb, x);
  sheetCharts(wb, x);

  // Đặt thêm ảnh biểu đồ cạnh bảng số liệu tương ứng để xem nhanh
  const pareto = x.charts?.find(c => c.key === "pareto");
  if (pareto) placeImage(wb, wb.getWorksheet(x.t("xl.paretoSheet")), pareto, 8, 0.5, 900);
  const hourly = wb.getWorksheet(x.t("xl.hourSheet"));
  let r = 0.5;
  for (const key of ["input", "output", "defect"]) {
    const c = x.charts?.find(ch => ch.key === key);
    if (c) r += placeImage(wb, hourly, c, 5, r, 560) + 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Kanban_${x.data.woCode}_${x.dateRange.from === x.dateRange.to ? x.dateRange.from : `${x.dateRange.from}_${x.dateRange.to}`}_${x.shift.key === "day" ? "CaNgay" : "CaDem"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
