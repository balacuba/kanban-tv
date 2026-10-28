// Xuất đúng những gì đang hiển thị trên Kanban (ca, khung giờ, công đoạn đang lọc) ra file .xlsx, kèm ảnh các biểu đồ.
// Cần thư viện exceljs (npm install exceljs); thư viện chỉ được tải khi bấm nút "Xuất Excel".
import { ChartImage, TFunc, rangeLabel, sum } from "./KanbanShared";
import { Pareto } from "./ErrorParetoChart";

export interface KanbanExport {
  t: TFunc;
  locale: string;
  st: { shift: string; shiftLower: string };
  shiftKey: string;
  shiftRangeText: string;
  dateRange: { from: string; to: string };
  fromLabel: string;
  toLabel: string;
  woCode: string;
  products: { name: string; plan: number; done: number }[];
  pmPlan: { model: string; inputGroup: string; outputGroup: string }[];
  allStages: number;            // tổng số công đoạn của WO (để biết đang lọc hay không)
  stageNames: string[];         // công đoạn đang xem
  view: {
    rows: { slot: string; cells: number[][] }[];
    totals: number[][];
    input: number[];
    output: number[];
    failByHour: number[];
    totalFail: number;
  };
  outside: number[][] | null;   // dòng "Ngoài giờ" (nếu có)
  pareto: Pareto;               // Pareto đang xem (theo ca / khung giờ / công đoạn)
  paretoScope: string;          // mô tả phạm vi của Pareto đang xem
  paretoOk: number;             // số lượng OK cùng phạm vi: tỷ lệ lỗi = lỗi / (OK + tổng lỗi)
  totalDefects: number;         // tổng lỗi cả khoảng ngày
  topDefect?: { name: string; count: number };
  defectRate: number;
  topStage: { name: string; fail: number } | null;
  planOutput: number;
  shiftOutput: number;
  charts: ChartImage[];
}

const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF0E3" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F6F8" } };
const MAIN_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EEFB" } };
const LINE = { style: "thin", color: { argb: "FFD9DCE1" } };
const BORDERS = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const RED = { argb: "FFD63B3B" };
const PCT = "0.0%";

function boxRow(row: any, opts: { head?: boolean; total?: boolean } = {}) {
  row.eachCell({ includeEmpty: true }, (c: any) => {
    c.border = BORDERS;
    if (opts.head) {
      c.fill = HEAD_FILL;
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    if (opts.total) {
      c.fill = TOTAL_FILL;
      c.font = { ...c.font, bold: true };
    }
  });
}

function addSection(ws: any, title: string) {
  const r = ws.addRow([title]);
  r.font = { bold: true, size: 12, color: { argb: "FF1F4E9C" } };
  return r;
}

function addTable(ws: any, header: any[], rows: any[][], total?: any[]) {
  boxRow(ws.addRow(header), { head: true });
  rows.forEach(r => boxRow(ws.addRow(r)));
  if (total) boxRow(ws.addRow(total), { total: true });
}

// Ghép mảng [[pass, fail], ...] thành một dòng phẳng pass, fail, pass, fail...
const flat = (cells: number[][]) => cells.reduce((acc: number[], c) => acc.concat(c), []);

/* ---------- Sheet 1: Tổng quan ---------- */
function sheetOverview(wb: any, x: KanbanExport) {
  const { t, st } = x;
  const ws = wb.addWorksheet(t("xl.overview"));
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 22 }];

  const title = ws.addRow([`Kanban – WO ${x.woCode}`]);
  title.font = { bold: true, size: 16, color: { argb: "FF0B4596" } };
  ws.addRow([]);

  addSection(ws, t("xl.filters"));
  [
    [t("xl.prodDate"), rangeLabel(x.dateRange)],
    [t("xl.shift"), `${st.shift} (${x.shiftRangeText})`],
    [t("xl.hours"), `${x.fromLabel} – ${x.toLabel}`],
    [t("xl.stages"), x.stageNames.length === x.allStages ? t("xl.all") : x.stageNames.join(", ")],
    [t("xl.exportedAt"), new Date().toLocaleString(x.locale)]
  ].forEach(r => boxRow(ws.addRow(r)));
  ws.addRow([]);

  addSection(ws, t("xl.defectSummary"));
  // Theo ca (và khung giờ, công đoạn) đang xem, giống các ô trên Kanban
  const top = x.topDefect;
  [
    [t("xl.totalShift", st), x.totalDefects],
    [t("xl.rateShift", st), x.defectRate],
    [t("xl.okQty", st), x.paretoOk],
    [t("xl.topDefectShift", st), top ? `${top.name} (${top.count})` : "—"],
    [t("xl.topStageShift", st), x.topStage
      ? `${x.topStage.name} (${x.topStage.fail} · ${x.totalDefects ? ((x.topStage.fail / x.totalDefects) * 100).toFixed(1) : 0}%)`
      : t("xl.noFail")]
  ].forEach(r => boxRow(ws.addRow(r)));
  ws.getCell(`B${ws.rowCount - 3}`).numFmt = "0.00%";
  ws.addRow([]);

  addSection(ws, t("xl.products"));
  addTable(ws, [t("xl.productName"), t("xl.plan"), t("xl.done"), t("xl.doneRate")],
    x.products.map(p => [p.name, p.plan, p.done, p.plan ? p.done / p.plan : 0]));
  for (let i = 0; i < x.products.length; i++) ws.getCell(`D${ws.rowCount - i}`).numFmt = PCT;
  ws.addRow([]);

  addSection(ws, `PM Plan (${st.shift})`);
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 12;
  // Dòng đầu tiên dùng PlanOutput người dùng nhập + sản lượng thực tế của ca
  addTable(ws, ["Model Name", "InputGroup", "OutputGroup", "PlanOutput", t("xl.actual", st), t("xl.achieved")],
    x.pmPlan.map((p, i) => (i === 0
      ? [p.model, p.inputGroup, p.outputGroup, x.planOutput, x.shiftOutput, x.planOutput ? x.shiftOutput / x.planOutput : ""]
      : [p.model, p.inputGroup, p.outputGroup, "", "", ""])));
  if (x.pmPlan.length) ws.getCell(`F${ws.rowCount - x.pmPlan.length + 1}`).numFmt = PCT;
}

/* ---------- Sheet 2: Kết quả theo công đoạn (mỗi công đoạn 2 cột Pass / Fail) ---------- */
function sheetStages(wb: any, x: KanbanExport) {
  const { t } = x;
  const ws = wb.addWorksheet(t("xl.stageSheet"), { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  const n = x.stageNames.length;
  ws.columns = [{ width: 14 }].concat(x.stageNames.reduce((a: any[]) => a.concat([{ width: 10 }, { width: 8 }]), []));

  const h1 = ws.addRow([t("xl.time")].concat(x.stageNames.reduce((a: string[], s) => a.concat([s, ""]), [])));
  const h2 = ws.addRow([""].concat(x.stageNames.reduce((a: string[]) => a.concat(["Pass", "Fail"]), [])));
  ws.mergeCells(1, 1, 2, 1);
  for (let j = 0; j < n; j++) ws.mergeCells(1, 2 + j * 2, 1, 3 + j * 2);
  boxRow(h1, { head: true });
  boxRow(h2, { head: true });

  const addLine = (label: string, cells: number[][], total?: boolean) => {
    const row = ws.addRow([label as any].concat(flat(cells)));
    boxRow(row, { total });
    cells.forEach((c, j) => { if (c[1] > 0) row.getCell(3 + j * 2).font = { bold: true, color: RED }; });
  };
  x.view.rows.forEach(r => addLine(r.slot, r.cells));
  addLine(t("xl.shiftTotal", x.st), x.view.totals, true);
  // % lỗi từng công đoạn trên tổng lỗi của ca (đặt ở cột Fail)
  const share = ws.addRow([t("xl.stageShare") as any].concat(
    x.view.totals.reduce((a: any[], c) => a.concat(["", x.totalDefects ? c[1] / x.totalDefects : 0]), [])));
  boxRow(share, { total: true });
  x.view.totals.forEach((_, j) => { share.getCell(3 + j * 2).numFmt = PCT; });
  if (x.outside) addLine(t("stage.outside"), x.outside);
}

/* ---------- Sheet 3: Pareto lỗi ---------- */
function sheetPareto(wb: any, x: KanbanExport) {
  const { t } = x;
  const ws = wb.addWorksheet(t("xl.paretoSheet"), { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = [{ width: 6 }, { width: 30 }, { width: 10 }, { width: 22 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 16 }];
  ws.addRow([x.paretoScope]).font = { italic: true, color: { argb: "FF5F6670" } };
  const base = x.paretoOk + x.pareto.total; // tỷ lệ lỗi = số lỗi / (OK + tổng lỗi)
  boxRow(ws.addRow(["#", t("xl.defectType"), t("xl.count"), t("xl.defectRate"), t("xl.cumRate"), t("xl.share"), t("xl.cum"), t("xl.mainGroup")]), { head: true });
  // Như biểu đồ: tỷ lệ lỗi từng loại làm tròn 0.01%, tỷ lệ lỗi cộng dồn = cộng các số đã làm tròn (0.69 → 1.03 → …)
  let cumRate = 0; // đơn vị 0.01%
  const rounded = (c: number) => (base ? Math.round((c / base) * 10000) : 0);
  x.pareto.items.forEach((d, i) => {
    cumRate += rounded(d.count);
    const row = ws.addRow([i + 1, d.name, d.count, rounded(d.count) / 10000, cumRate / 10000, d.share, d.cum, d.main ? t("xl.yes") : ""]);
    boxRow(row);
    row.getCell(4).numFmt = "0.00%";
    row.getCell(5).numFmt = "0.00%";
    row.getCell(6).numFmt = PCT;
    row.getCell(7).numFmt = PCT;
    if (d.main) row.eachCell((c: any) => { c.fill = MAIN_FILL; });
  });
  const total = ws.addRow(["", `${t("xl.total")} (OK ${x.paretoOk})`, x.pareto.total, cumRate / 10000, cumRate / 10000, 1, "", ""]);
  boxRow(total, { total: true });
  total.getCell(4).numFmt = "0.00%";
  total.getCell(5).numFmt = "0.00%";
  total.getCell(6).numFmt = PCT;
}

/* ---------- Sheet 4: Số liệu theo giờ ---------- */
function sheetHourly(wb: any, x: KanbanExport) {
  const { t } = x;
  const ws = wb.addWorksheet(t("xl.hourSheet"), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 10 }];
  const v = x.view;
  addTable(ws, [t("xl.hours"), t("xl.input"), t("xl.output"), t("xl.count")],
    v.rows.map((r, k) => [r.slot, v.input[k], v.output[k], v.failByHour[k]]),
    [t("xl.total"), sum(v.input), sum(v.output), v.totalFail]);
}

/* ---------- Sheet 5: Biểu đồ (ảnh chụp từ trang) ---------- */
// exceljs không tạo được biểu đồ Excel gốc, nên chèn ảnh PNG của chính các biểu đồ đang hiển thị.
const ROW_PX = 20; // chiều cao dòng mặc định của Excel (≈ 15pt)

function placeImage(wb: any, ws: any, chart: ChartImage, col: number, row: number, maxWidth: number) {
  const w = Math.min(maxWidth, chart.width);
  const h = Math.round(chart.height * (w / chart.width));
  // Mỗi ảnh chỉ nhúng vào file một lần, dùng lại cho các sheet khác để file nhẹ hơn
  if (chart.imageId === undefined) chart.imageId = wb.addImage({ base64: chart.base64, extension: "png" });
  ws.addImage(chart.imageId, { tl: { col, row }, ext: { width: w, height: h } });
  return Math.ceil(h / ROW_PX);
}

function sheetCharts(wb: any, x: KanbanExport) {
  if (!x.charts.length) return;
  const ws = wb.addWorksheet(x.t("xl.chartSheet"));
  ws.getColumn(1).width = 4;
  let row = 1;
  const title = ws.getCell(row, 2);
  title.value = `${x.t("xl.chartTitle")} – WO ${x.woCode} – ${rangeLabel(x.dateRange)} – ${x.st.shift}`;
  title.font = { bold: true, size: 14, color: { argb: "FF0B4596" } };
  row += 2;
  x.charts.forEach(c => {
    const cell = ws.getCell(row, 2);
    cell.value = c.title;
    cell.font = { bold: true, size: 12, color: { argb: "FF1F6F66" } };
    row += 1;
    row += placeImage(wb, ws, c, 1, row - 1 + 0.2, c.key === "pareto" ? 1100 : 760) + 2;
  });
}

export async function exportKanbanExcel(x: KanbanExport) {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kanban";
  wb.created = new Date();

  sheetOverview(wb, x);
  sheetStages(wb, x);
  sheetPareto(wb, x);
  sheetHourly(wb, x);
  sheetCharts(wb, x);

  // Đặt thêm ảnh biểu đồ cạnh bảng số liệu tương ứng để xem nhanh
  const find = (key: string) => x.charts.filter(c => c.key === key)[0];
  const pareto = find("pareto");
  if (pareto) placeImage(wb, wb.getWorksheet(x.t("xl.paretoSheet")), pareto, 7, 0.5, 900);
  const hourly = wb.getWorksheet(x.t("xl.hourSheet"));
  let r = 0.5;
  ["input", "output", "defect"].forEach(key => {
    const c = find(key);
    if (c) r += placeImage(wb, hourly, c, 5, r, 560) + 1;
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const range = x.dateRange.from === x.dateRange.to ? x.dateRange.from : `${x.dateRange.from}_${x.dateRange.to}`;
  a.href = url;
  a.download = `Kanban_${x.woCode}_${range}_${x.shiftKey === "day" ? "CaNgay" : "CaDem"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
