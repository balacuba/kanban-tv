import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Phần dùng chung cho màn Kanban (HourlyOutputReport):
 * ca làm việc, định dạng số, hook kích thước / xem toàn bộ, đa ngôn ngữ, biểu đồ theo giờ, chụp biểu đồ ra ảnh.
 */

/* ================= Ca làm việc + khung giờ ================= */
// Một ngày sản xuất = ca ngày 08:00–20:00 + ca đêm 20:00–08:00 hôm sau. Nhà máy đổi giờ ca thì chỉ sửa SHIFTS.
export interface Shift { key: "day" | "night"; from: number; hours: number; }
export const SHIFTS: Shift[] = [
  { key: "day", from: 8, hours: 12 },
  { key: "night", from: 20, hours: 12 }
];

// SLOTS: tên khung giờ "8:00-9:00" theo thứ tự ca; SLOT_HOUR: giờ bắt đầu của từng khung
export const SLOTS: string[] = [];
export const SLOT_SHIFT: number[] = [];
export const SLOT_HOUR: number[] = [];
SHIFTS.forEach((s, si) => {
  for (let k = 0; k < s.hours; k++) {
    const h = (s.from + k) % 24;
    SLOTS.push(`${h}:00-${(h + 1) % 24}:00`);
    SLOT_SHIFT.push(si);
    SLOT_HOUR.push(h);
  }
});
export const HOURS = SLOTS.map(s => s.split("-")[0]);

export const SHIFT_CHECK_MS = 30000; // kiểm tra đổi ca
export const REFRESH_MS = 30000;     // tự tải lại dữ liệu
export const MAX_DAYS = 31;          // số ngày tối đa khi lọc theo khoảng ngày

export const pad2 = (h: number) => String(h).padStart(2, "0");
export const shiftRange = (s: Shift, nextDay = " hôm sau") =>
  `${pad2(s.from)}:00 – ${pad2((s.from + s.hours) % 24)}:00${s.from + s.hours > 24 ? nextDay : ""}`;
export const shiftSlots = (si: number) => SLOTS.map((_, i) => i).filter(i => SLOT_SHIFT[i] === si);

// Ca đang chạy theo giờ của máy
export const currentShift = (hour = new Date().getHours()) =>
  SHIFTS.findIndex(s => (hour - s.from + 24) % 24 < s.hours);

const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Ngày sản xuất: từ 0:00 đến trước giờ bắt đầu ca ngày vẫn thuộc ca đêm của ngày hôm trước
export function productionDate(now = new Date()) {
  const d = new Date(now.getTime());
  if (d.getHours() < SHIFTS[0].from) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const dayCount = (r: { from: string; to: string }) =>
  Math.round((parseDate(r.to).getTime() - parseDate(r.from).getTime()) / 86400000) + 1;
const viDate = (s: string) => s.split("-").reverse().join("/");
export const rangeLabel = (r: { from: string; to: string }) =>
  (r.from === r.to ? viDate(r.from) : `${viDate(r.from)} – ${viDate(r.to)}`);

// Cộng / trừ ngày cho chuỗi "YYYY-MM-DD"
export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// Danh sách ngày "YYYY-MM-DD" trong khoảng; quá MAX_DAYS thì lấy MAX_DAYS ngày cuối
export function listDays(from: string, to: string, max = MAX_DAYS) {
  const out: string[] = [];
  const end = parseDate(to);
  const d = parseDate(from);
  while (d.getTime() <= end.getTime()) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out.slice(-max);
}

// Khung giờ backend trả về ("8:00-9:00", "08:00 - 09:00"...) -> vị trí trong SLOTS; -1 nếu ngoài khung giờ
export function slotOf(testTime: any) {
  const m = /^\s*(\d{1,2})\s*[:h]/.exec(String(testTime ?? ""));
  return m ? SLOT_HOUR.indexOf(Number(m[1])) : -1;
}

/* ================= Định dạng ================= */
export const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString("vi-VN");
export const pct = (a: number, b: number, d = 0) => (b ? ((a / b) * 100).toFixed(d) + "%" : "0%");
export const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

// Giá trị đỉnh trục Y "tròn" để chia 4 vạch đẹp
export function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.2, 1.6, 2, 4, 6, 8, 10]) if (s * p >= v) return s * p;
  return v;
}

// Ngắt tên dài thành nhiều dòng, mỗi dòng tối đa `max` ký tự
export function wrapWords(text: string, max: number) {
  const lines = [""];
  for (const w of text.split(" ")) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + " " + w).length > max) lines.push(w);
    else lines[lines.length - 1] = cur ? cur + " " + w : w;
  }
  return lines;
}

/* ================= Hook ================= */
// Kích thước thật của một phần tử (biểu đồ SVG vẽ theo đó)
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const width = el.clientWidth, height = el.clientHeight;
      setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    const RO: any = (window as any).ResizeObserver;
    if (RO) {
      const ro = new RO(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return [ref, size] as const;
}

// Ca đang chạy theo đồng hồ; tự cập nhật khi qua mốc đổi ca
export function useCurrentShift(intervalMs = SHIFT_CHECK_MS) {
  const [shift, setShift] = useState(() => currentShift());
  useEffect(() => {
    const id = setInterval(() => setShift(currentShift()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return shift;
}

// Chế độ "Xem toàn bộ": chỉnh zoom của khung Kanban để toàn bộ vừa phần màn hình còn lại (dưới thanh menu của ứng dụng),
// hoặc vừa cả màn hình khi đang toàn màn hình. Zoom đổi thì bố cục đổi theo nên tính lặp vài lần tới khi ổn định.
const FIT_MIN = 0.3, FIT_MAX = 1.4;

export function useFitToScreen(ref: React.MutableRefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    el.classList.add("wd-fit");

    let busy = false;
    const available = () => {
      const full = (document as any).fullscreenElement === el;
      return full ? window.innerHeight : window.innerHeight - Math.max(0, el.getBoundingClientRect().top);
    };
    // Chiều cao thật của nội dung (thanh tiêu đề + phần thân). Không dùng scrollHeight của khung vì khi toàn màn hình
    // (hoặc khung chứa cao hơn nội dung) khung bị kéo cao bằng màn hình, Kanban sẽ không được phóng to lấp chỗ trống.
    const contentHeight = () => {
      let h = 0;
      for (let i = 0; i < el.children.length; i++) h += (el.children[i] as HTMLElement).offsetHeight;
      return h || el.scrollHeight;
    };
    const fit = () => {
      if (busy) return;
      busy = true;
      let z = Number(el.style.getPropertyValue("zoom")) || 1;
      for (let i = 0; i < 6; i++) {
        el.style.setProperty("zoom", String(z));
        const next = Math.min(FIT_MAX, Math.max(FIT_MIN, (available() / contentHeight()) * 0.995));
        if (Math.abs(next - z) < 0.004) break;
        z = next;
      }
      el.style.setProperty("zoom", String(z));
      requestAnimationFrame(() => { busy = false; });
    };

    fit();
    const RO: any = (window as any).ResizeObserver;
    const ro = RO ? new RO(() => requestAnimationFrame(fit)) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
      el.style.removeProperty("zoom");
      el.classList.remove("wd-fit");
    };
  }, [ref, enabled]);
}

// Đóng menu khi bấm ra ngoài
export function useClickOutside(ref: React.MutableRefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [ref, onOutside]);
}

/* ================= Đa ngôn ngữ: Tiếng Việt / English / 中文 ================= */
// Thêm ngôn ngữ = thêm một mục vào LANGS và một bộ chữ vào DICT. Chữ có tham số viết dạng {ten}.
export const LANGS = [
  { key: "vi", label: "VI", name: "Tiếng Việt", locale: "vi-VN" },
  { key: "en", label: "EN", name: "English", locale: "en-GB" },
  { key: "zh", label: "中文", name: "中文", locale: "zh-CN" }
];

type Dict = { [key: string]: string };
const DICT: { [lang: string]: Dict } = {
  vi: {
    "fit.on": "Xem toàn bộ trên một màn hình", "fit.off": "Thoát xem toàn bộ",
    "search.show": "Tìm kiếm", "search.hide": "Ẩn tìm kiếm", "lang": "Ngôn ngữ",
    "f.wo": "WO Line", "f.woPlaceholder": "Chọn hoặc nhập WO-Line",
    "f.date": "Thời gian", "f.dateFrom": "Từ ngày", "f.dateTo": "Đến ngày",
    "f.shift": "Ca", "f.auto": "Tự động: {shift}", "f.hours": "Khung giờ", "f.hoursTo": "Đến khung giờ", "f.stage": "Công đoạn",
    "stages.all": "Tất cả công đoạn", "stages.allN": "Tất cả công đoạn ({n})", "stages.none": "Chưa chọn công đoạn", "stages.n": "{n} công đoạn",
    "btn.search": "Tìm kiếm", "btn.reset": "Bỏ lọc", "btn.resetTip": "Đưa bộ lọc về mặc định",
    "btn.export": "Xuất Excel", "btn.exporting": "Đang xuất…", "btn.exportTip": "Xuất dữ liệu đang xem ra file Excel",
    "shift.day": "Ca ngày", "shift.night": "Ca đêm", "nextDay": " hôm sau",
    "kpi.total": "Tổng lỗi", "kpi.rate": "Tỷ lệ lỗi",
    "kpi.topDefect": "Lỗi nhiều nhất", "kpi.topDefectSub": "{n} lỗi · {p} tổng lỗi",
    "kpi.topStage": "Công đoạn lỗi nhiều nhất", "kpi.noFail": "Không có lỗi", "kpi.topStageSub": "{n} lỗi · {p} tổng lỗi",
    "kpi.wo": "Mã WO-Line", "kpi.done": "Sản lượng hoàn thành",
    "info.product": "Sản phẩm", "info.noData": "Không có dữ liệu để hiển thị",
    "info.model": "Thông tin model", "info.output": "Sản lượng {shiftLower}", "info.actual": "Thực tế", "info.rate": "Đạt",
    "info.enterPlan": "Nhập PlanOutput",
    "pareto.title": "Defect Distribution", "pareto.none": "Không có dữ liệu lỗi",
    "pareto.cum": "Tích lũy", "pareto.count": "Số lỗi", "pareto.type": "Loại lỗi",
    "pareto.tip": "#{i} {name}: {n} lỗi ({p}) · tích lũy {c}", "pareto.tipQty": " · trên sản lượng {q}",
    "pareto.scope": "Dữ liệu: {d} · cả ngày (2 ca)",
    "pareto.scopeFiltered": "Dữ liệu: {d} · {shift} {from} – {to} · {stages}",
    "pareto.noteFilter": "Không tải được lỗi theo công đoạn / giờ, biểu đồ đang hiện lỗi cả ngày",
    "legend.main": "Thuộc nhóm lỗi chính", "legend.threshold": "- - - Ngưỡng 80%", "legend.total": "Tổng: {n} lỗi",
    "legend.rate": "Tỷ lệ lỗi = {ng} lỗi / ({ok} OK + {ng} lỗi) = {p}",
    "pareto.tipRate": " · tỷ lệ lỗi {r}",
    "xl.defectRate": "Tỷ lệ lỗi (lỗi / (OK + lỗi))",
    "xl.totalShift": "Tổng lỗi ({shiftLower})", "xl.rateShift": "Tỷ lệ lỗi ({shiftLower}) = lỗi / (OK + lỗi)",
    "xl.okQty": "Số lượng OK ({shiftLower})", "xl.topDefectShift": "Lỗi nhiều nhất ({shiftLower})",
    "xl.topStageShift": "Công đoạn lỗi nhiều nhất ({shiftLower})",
    "detail.in": "Input Detail", "detail.out": "Output Detail", "detail.def": "Defect Detail",
    "detail.inSub": "Đầu vào theo giờ", "detail.outSub": "Đầu ra theo giờ", "detail.defSub": "Số lỗi theo giờ",
    "chart.avg": "TB", "chart.empty": "Chưa có dữ liệu",
    "stage.title": "Kết quả theo công đoạn", "stage.time": "Thời gian", "stage.total": "Tổng {shiftLower}",
    "stage.share": "{n} lỗi · {p}", "xl.stageShare": "% lỗi / tổng lỗi",
    "stage.noneSel": "Chưa chọn công đoạn nào", "stage.noStages": "WO-Line này chưa được cấu hình công đoạn", "stage.outside": "Ngoài giờ",
    "app.loading": "Đang tải dữ liệu…", "app.noData": "Không có dữ liệu", "app.pickWo": "Chọn WO-Line và bấm Tìm kiếm để xem dữ liệu",
    "app.exportErr": "Không xuất được file Excel: {m}",
    "msg.needWo": "Vui lòng chọn WO-Line!", "msg.unknown": "Lỗi không xác định",
    "msg.errorNames": "Không tải được danh sách tên lỗi. Biểu đồ tạm hiển thị mã lỗi.",
    "msg.maxDays": "Chỉ xem tối đa {n} ngày một lần, đã lấy {n} ngày cuối của khoảng đã chọn.",
    // File Excel
    "xl.overview": "Tổng quan", "xl.filters": "Bộ lọc", "xl.prodDate": "Ngày sản xuất", "xl.shift": "Ca", "xl.hours": "Khung giờ",
    "xl.stages": "Công đoạn", "xl.all": "Tất cả", "xl.exportedAt": "Thời điểm xuất",
    "xl.defectSummary": "Tổng quan lỗi", "xl.totalDay": "Tổng lỗi", "xl.rate": "Tỷ lệ lỗi", "xl.failAt": "Lỗi tại công đoạn ({shift})",
    "xl.topDefect": "Lỗi nhiều nhất", "xl.topStage": "Công đoạn lỗi nhiều nhất", "xl.noFail": "Không có lỗi",
    "xl.products": "Sản phẩm", "xl.productName": "Tên sản phẩm", "xl.plan": "Sản lượng dự kiến", "xl.done": "Sản lượng hoàn thành", "xl.doneRate": "Tỷ lệ hoàn thành",
    "xl.actual": "Thực tế ({shift})", "xl.achieved": "Đạt",
    "xl.stageSheet": "Kết quả công đoạn", "xl.time": "Thời gian", "xl.total": "Tổng", "xl.shiftTotal": "Tổng {shiftLower}",
    "xl.paretoSheet": "Defect Pareto", "xl.defectType": "Loại lỗi", "xl.count": "Số lỗi", "xl.share": "Tỷ lệ", "xl.cum": "Tích lũy",
    "xl.mainGroup": "Nhóm lỗi chính", "xl.yes": "Có",
    "xl.hourSheet": "Theo giờ", "xl.input": "Đầu vào", "xl.output": "Đầu ra",
    "xl.chartSheet": "Biểu đồ", "xl.chartTitle": "Biểu đồ", "xl.paretoChart": "Defect Distribution (Pareto lỗi)",
    "xl.inChart": "Input Detail – đầu vào theo giờ", "xl.outChart": "Output Detail – đầu ra theo giờ", "xl.defChart": "Defect Detail – số lỗi theo giờ"
  },
  en: {
    "fit.on": "Fit the whole Kanban on one screen", "fit.off": "Exit full view",
    "search.show": "Search", "search.hide": "Hide search", "lang": "Language",
    "f.wo": "WO Line", "f.woPlaceholder": "Select or type a WO-Line",
    "f.date": "Date", "f.dateFrom": "From date", "f.dateTo": "To date",
    "f.shift": "Shift", "f.auto": "Auto: {shift}", "f.hours": "Time slot", "f.hoursTo": "To time slot", "f.stage": "Stage",
    "stages.all": "All stages", "stages.allN": "All stages ({n})", "stages.none": "No stage selected", "stages.n": "{n} stages",
    "btn.search": "Search", "btn.reset": "Reset", "btn.resetTip": "Reset filters to default",
    "btn.export": "Export Excel", "btn.exporting": "Exporting…", "btn.exportTip": "Export the current view to an Excel file",
    "shift.day": "Day shift", "shift.night": "Night shift", "nextDay": " next day",
    "kpi.total": "Total defects", "kpi.rate": "Defect rate",
    "kpi.topDefect": "Top defect", "kpi.topDefectSub": "{n} defects · {p} of total",
    "kpi.topStage": "Top failing stage", "kpi.noFail": "No fails", "kpi.topStageSub": "{n} fails · {p} of total",
    "kpi.wo": "WO-Line code", "kpi.done": "Completed output",
    "info.product": "Product", "info.noData": "No data to display",
    "info.model": "Model info", "info.output": "{shift} output", "info.actual": "Actual", "info.rate": "Achieved",
    "info.enterPlan": "Enter PlanOutput",
    "pareto.title": "Defect Distribution", "pareto.none": "No defect data",
    "pareto.cum": "Cumulative", "pareto.count": "Defects", "pareto.type": "Defect type",
    "pareto.tip": "#{i} {name}: {n} defects ({p}) · cumulative {c}", "pareto.tipQty": " · of output {q}",
    "pareto.scope": "Data: {d} · whole day (both shifts)",
    "pareto.scopeFiltered": "Data: {d} · {shift} {from} – {to} · {stages}",
    "pareto.noteFilter": "Could not load defects by stage / hour; showing whole-day defects",
    "legend.main": "Main defect group", "legend.threshold": "- - - 80% threshold", "legend.total": "Total: {n} defects",
    "legend.rate": "Defect rate = {ng} defects / ({ok} OK + {ng} defects) = {p}",
    "pareto.tipRate": " · defect rate {r}",
    "xl.defectRate": "Defect rate (defects / (OK + defects))",
    "xl.totalShift": "Total defects ({shift})", "xl.rateShift": "Defect rate ({shift}) = defects / (OK + defects)",
    "xl.okQty": "OK quantity ({shift})", "xl.topDefectShift": "Top defect ({shift})",
    "xl.topStageShift": "Top failing stage ({shift})",
    "detail.in": "Input Detail", "detail.out": "Output Detail", "detail.def": "Defect Detail",
    "detail.inSub": "Input by hour", "detail.outSub": "Output by hour", "detail.defSub": "Defects by hour",
    "chart.avg": "Avg", "chart.empty": "No data yet",
    "stage.title": "Results by stage", "stage.time": "Time", "stage.total": "{shift} total",
    "stage.share": "{n} fails · {p}", "xl.stageShare": "% of total defects",
    "stage.noneSel": "No stage selected", "stage.noStages": "No stages are configured for this WO-Line", "stage.outside": "Off-hours",
    "app.loading": "Loading data…", "app.noData": "No data", "app.pickWo": "Select a WO-Line and press Search to view data",
    "app.exportErr": "Could not export the Excel file: {m}",
    "msg.needWo": "Please select a WO-Line!", "msg.unknown": "Unknown error",
    "msg.errorNames": "Could not load defect names. The chart shows defect codes for now.",
    "msg.maxDays": "At most {n} days can be viewed at once; the last {n} days of the range were loaded.",
    "xl.overview": "Overview", "xl.filters": "Filters", "xl.prodDate": "Production date", "xl.shift": "Shift", "xl.hours": "Time slot",
    "xl.stages": "Stages", "xl.all": "All", "xl.exportedAt": "Exported at",
    "xl.defectSummary": "Defect summary", "xl.totalDay": "Total defects", "xl.rate": "Defect rate", "xl.failAt": "Stage fails ({shift})",
    "xl.topDefect": "Top defect", "xl.topStage": "Top failing stage", "xl.noFail": "No fails",
    "xl.products": "Products", "xl.productName": "Product name", "xl.plan": "Planned output", "xl.done": "Completed output", "xl.doneRate": "Completion rate",
    "xl.actual": "Actual ({shift})", "xl.achieved": "Achieved",
    "xl.stageSheet": "Stage results", "xl.time": "Time", "xl.total": "Total", "xl.shiftTotal": "{shift} total",
    "xl.paretoSheet": "Defect Pareto", "xl.defectType": "Defect type", "xl.count": "Defects", "xl.share": "Share", "xl.cum": "Cumulative",
    "xl.mainGroup": "Main group", "xl.yes": "Yes",
    "xl.hourSheet": "By hour", "xl.input": "Input", "xl.output": "Output",
    "xl.chartSheet": "Charts", "xl.chartTitle": "Charts", "xl.paretoChart": "Defect Distribution (Pareto)",
    "xl.inChart": "Input Detail – input by hour", "xl.outChart": "Output Detail – output by hour", "xl.defChart": "Defect Detail – defects by hour"
  },
  zh: {
    "fit.on": "在一个屏幕上显示整个看板", "fit.off": "退出全屏显示",
    "search.show": "搜索", "search.hide": "隐藏搜索", "lang": "语言",
    "f.wo": "WO Line", "f.woPlaceholder": "选择或输入 WO-Line",
    "f.date": "日期", "f.dateFrom": "开始日期", "f.dateTo": "结束日期",
    "f.shift": "班次", "f.auto": "自动：{shift}", "f.hours": "时段", "f.hoursTo": "结束时段", "f.stage": "工序",
    "stages.all": "全部工序", "stages.allN": "全部工序（{n}）", "stages.none": "未选择工序", "stages.n": "{n} 个工序",
    "btn.search": "搜索", "btn.reset": "重置", "btn.resetTip": "恢复默认筛选",
    "btn.export": "导出 Excel", "btn.exporting": "正在导出…", "btn.exportTip": "将当前数据导出为 Excel 文件",
    "shift.day": "白班", "shift.night": "夜班", "nextDay": "（次日）",
    "kpi.total": "不良总数", "kpi.rate": "不良率",
    "kpi.topDefect": "最多不良", "kpi.topDefectSub": "{n} 个 · 占总不良 {p}",
    "kpi.topStage": "不良最多工序", "kpi.noFail": "无不良", "kpi.topStageSub": "{n} 个不良 · 占总不良 {p}",
    "kpi.wo": "WO-Line 编号", "kpi.done": "完成产量",
    "info.product": "产品", "info.noData": "暂无数据",
    "info.model": "机型信息", "info.output": "{shift}产量", "info.actual": "实际", "info.rate": "达成率",
    "info.enterPlan": "请输入 PlanOutput",
    "pareto.title": "不良分布", "pareto.none": "暂无不良数据",
    "pareto.cum": "累计", "pareto.count": "不良数", "pareto.type": "不良类型",
    "pareto.tip": "#{i} {name}：{n} 个（{p}）· 累计 {c}", "pareto.tipQty": " · 占产量 {q}",
    "pareto.scope": "数据：{d} · 全天（两班）",
    "pareto.scopeFiltered": "数据：{d} · {shift} {from} – {to} · {stages}",
    "pareto.noteFilter": "无法按工序 / 时段加载不良，图表显示全天不良",
    "legend.main": "主要不良", "legend.threshold": "- - - 80% 阈值", "legend.total": "合计：{n} 个不良",
    "legend.rate": "不良率 = {ng} 不良 / ({ok} OK + {ng} 不良) = {p}",
    "pareto.tipRate": " · 不良率 {r}",
    "xl.defectRate": "不良率（不良 / (OK + 不良)）",
    "xl.totalShift": "不良总数（{shift}）", "xl.rateShift": "不良率（{shift}）= 不良 / (OK + 不良)",
    "xl.okQty": "OK 数量（{shift}）", "xl.topDefectShift": "最多不良（{shift}）",
    "xl.topStageShift": "不良最多工序（{shift}）",
    "detail.in": "投入明细", "detail.out": "产出明细", "detail.def": "不良明细",
    "detail.inSub": "每小时投入", "detail.outSub": "每小时产出", "detail.defSub": "每小时不良",
    "chart.avg": "均值", "chart.empty": "暂无数据",
    "stage.title": "各工序结果", "stage.time": "时间", "stage.total": "{shift}合计",
    "stage.share": "{n} 个 · {p}", "xl.stageShare": "占总不良 %",
    "stage.noneSel": "未选择工序", "stage.noStages": "该 WO-Line 尚未配置工序", "stage.outside": "非工作时段",
    "app.loading": "正在加载数据…", "app.noData": "暂无数据", "app.pickWo": "请选择 WO-Line 并点击搜索",
    "app.exportErr": "Excel 导出失败：{m}",
    "msg.needWo": "请选择 WO-Line！", "msg.unknown": "未知错误",
    "msg.errorNames": "无法加载不良名称，图表暂时显示不良代码。",
    "msg.maxDays": "一次最多查看 {n} 天，已加载所选范围的最后 {n} 天。",
    "xl.overview": "概览", "xl.filters": "筛选条件", "xl.prodDate": "生产日期", "xl.shift": "班次", "xl.hours": "时段",
    "xl.stages": "工序", "xl.all": "全部", "xl.exportedAt": "导出时间",
    "xl.defectSummary": "不良概况", "xl.totalDay": "不良总数", "xl.rate": "不良率", "xl.failAt": "工序不良（{shift}）",
    "xl.topDefect": "最多不良", "xl.topStage": "不良最多工序", "xl.noFail": "无不良",
    "xl.products": "产品", "xl.productName": "产品名称", "xl.plan": "计划产量", "xl.done": "完成产量", "xl.doneRate": "完成率",
    "xl.actual": "实际（{shift}）", "xl.achieved": "达成率",
    "xl.stageSheet": "工序结果", "xl.time": "时间", "xl.total": "合计", "xl.shiftTotal": "{shift}合计",
    "xl.paretoSheet": "不良柏拉图", "xl.defectType": "不良类型", "xl.count": "不良数", "xl.share": "占比", "xl.cum": "累计",
    "xl.mainGroup": "主要不良", "xl.yes": "是",
    "xl.hourSheet": "按小时", "xl.input": "投入", "xl.output": "产出",
    "xl.chartSheet": "图表", "xl.chartTitle": "图表", "xl.paretoChart": "不良分布（柏拉图）",
    "xl.inChart": "投入明细 – 每小时投入", "xl.outChart": "产出明细 – 每小时产出", "xl.defChart": "不良明细 – 每小时不良"
  }
};

type Params = { [key: string]: string | number };
export type TFunc = (key: string, params?: Params) => string;

// Dịch một khóa; thiếu bản dịch thì dùng tiếng Việt, thiếu nữa thì trả về chính khóa
export function translate(lang: string, key: string, params?: Params) {
  const s = (DICT[lang] && DICT[lang][key]) || DICT.vi[key] || key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m)) : s;
}

export interface I18n {
  lang: string;
  setLang: (lang: string) => void;
  t: TFunc;
  locale: string;
  // Tên ca theo ngôn ngữ; shiftLower dùng giữa câu tiếng Việt ("Sản lượng ca ngày")
  shiftText: (s: Shift) => { shift: string; shiftLower: string };
}

const makeI18n = (lang: string, setLang: (l: string) => void): I18n => {
  const t: TFunc = (key, params) => translate(lang, key, params);
  return {
    lang,
    setLang,
    t,
    locale: (LANGS.find(l => l.key === lang) || LANGS[0]).locale,
    shiftText: s => {
      const name = t(`shift.${s.key}`);
      return { shift: name, shiftLower: lang === "vi" ? name.toLowerCase() : name };
    }
  };
};

const LANG_KEY = "kanban-lang";
const I18nContext = createContext<I18n>(makeI18n("vi", () => undefined));

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch { /* bỏ qua */ }
    return LANGS.some(l => l.key === saved) ? (saved as string) : "vi";
  });
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* bỏ qua */ }
  }, [lang]);
  const value = useMemo(() => makeI18n(lang, setLang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);

/* ================= Biểu đồ theo khung giờ ================= */
// Đường cong mượt không vượt quá điểm dữ liệu (monotone cubic) — tránh đường cong vọt xuống dưới 0
function monotonePath(pts: number[][]) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : "";
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

let gradSeq = 0;

export interface HourChartProps {
  values: number[];
  labels: string[];
  color: string;
  /** "area": đường cong + vùng tô + đường trung bình; "line": đường gấp khúc có vùng tô; "bar": cột */
  type: "area" | "line" | "bar";
  night?: boolean;
  chartKey: string;
}

export const HourChart = ({ values, labels, color, type, night, chartKey }: HourChartProps) => {
  const gradId = useRef(`kb-grad-${++gradSeq}`).current;
  const { t } = useI18n();
  const [ref, { width: W, height: H }] = useElementSize();
  const L = 34, R = 10, T = 30, B = 26;
  const n = values.length, pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(0, ...values));
  const band = n ? pw / n : 0;
  const x = (i: number) => L + band * (i + 0.5);
  const y = (v: number) => T + ph - (v / max) * ph;
  // Số nhãn giờ theo độ rộng thật (~44px mỗi nhãn) để biểu đồ hẹp không bị chồng chữ
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 44))));
  // Nhãn cuối chỉ hiện khi cách nhãn đều đặn gần nhất đủ 40px
  const showLast = n > 1 && ((n - 1) % step) * band >= 40;
  const bw = Math.min(24, band * 0.65);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const ready = W > 0 && H > 0;

  const running = values.filter(v => v > 0);
  const avg = running.length ? sum(running) / running.length : 0;
  const avgLabel = `${t("chart.avg")} ${Math.round(avg)}`;
  const avgW = avgLabel.length * 7.6 + 12;

  return (
    <div className="plot" ref={ref} data-chart={chartKey}>
      {ready && (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {night && <rect x={L} y={T} width={pw} height={ph} fill="#eef1f6" />}
          {[0, 1, 2, 3, 4].map(k => {
            const v = (max / 4) * k;
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={k ? "#eceef1" : "#c3c7cd"} />
                <text x={L - 6} y={y(v) + 4} textAnchor="end">{+v.toFixed(1)}</text>
              </g>
            );
          })}
          {labels.map((h, i) => (i % step === 0 || (i === n - 1 && showLast)) && (
            <text key={h} x={x(i)} y={H - 8} textAnchor="middle">{h}</text>
          ))}

          {type === "bar" && values.map((v, i) => v > 0 && (
            <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx={3} fill={color} />
          ))}

          {type === "area" && n > 1 && (
            <>
              <path d={`${monotonePath(pts)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradId})`} />
              <path d={monotonePath(pts)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              {avg > 0 && (
                <g>
                  <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke={color} strokeOpacity={0.55} strokeDasharray="4 4" />
                  {/* Nhãn TB dạng thẻ màu của biểu đồ, chữ trắng; đặt ở đầu trái để không đè số liệu cuối ca */}
                  <rect x={L + 4} y={y(avg) - 22} width={avgW} height={18} rx={9} fill={color} />
                  <text x={L + 4 + avgW / 2} y={y(avg) - 8.5} textAnchor="middle" className="avg">{avgLabel}</text>
                </g>
              )}
              {values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={v ? 4 : 2} fill="#fff" stroke={color} strokeWidth={v ? 2.5 : 1.5} />
              ))}
            </>
          )}

          {type === "line" && n > 0 && (
            <>
              <polygon points={`${x(0)},${y(0)} ${pts.map(p => p.join(",")).join(" ")} ${x(n - 1)},${y(0)}`} fill={color} fillOpacity={0.12} />
              <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
              {values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={v ? 4 : 2.5} fill={v ? color : "#fff"} stroke={color} strokeWidth={2} />
              ))}
            </>
          )}

          {values.map((v, i) => v > 0 && (
            <text key={"v" + i} x={x(i)} y={y(v) - 9} textAnchor="middle" className="val">{v}</text>
          ))}
          {!values.some(Boolean) && (
            <text x={L + pw / 2} y={T + ph / 2} textAnchor="middle">{t("chart.empty")}</text>
          )}
        </svg>
      )}
    </div>
  );
};

// Khung thẻ của 3 biểu đồ Detail: viền trên + dải tiêu đề + biểu tượng theo màu biểu đồ
export const DetailCard = ({ tone, icon, title, sub, children }: {
  tone: "in" | "out" | "def";
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) => (
  <div className={`card detail-card ${tone}`}>
    <h2 className="card-title">
      <span className="detail-title">
        <span className="detail-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg></span>
        {title}
      </span>
      <small>{sub}</small>
    </h2>
    <div className="card-body">{children}</div>
  </div>
);

/* ================= Chụp biểu đồ ra ảnh PNG (để chèn vào Excel) ================= */
// Style của chữ/đường trong SVG nằm ở file CSS nên phải chép style đã tính vào từng phần tử trước khi xuất
const STYLE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "opacity", "font-family", "font-size", "font-weight", "letter-spacing", "text-anchor", "visibility"
];

export interface ChartImage { key: string; title: string; base64: string; width: number; height: number; imageId?: number; }

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

export async function svgToPng(svg: SVGSVGElement, scale = 2) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg as Element].concat(Array.prototype.slice.call(svg.querySelectorAll("*")));
  const dst = [clone as Element].concat(Array.prototype.slice.call(clone.querySelectorAll("*")));
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute("style", STYLE_PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  });

  const vb = svg.viewBox && svg.viewBox.baseVal;
  const width = Math.round((vb && vb.width) || svg.clientWidth);
  const height = Math.round((vb && vb.height) || svg.clientHeight);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone)));
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return { base64: canvas.toDataURL("image/png"), width, height };
}

// Lấy các biểu đồ đang có trên trang (đánh dấu bằng data-chart) theo thứ tự cho trước
export async function captureCharts(root: HTMLElement | null, list: { key: string; title: string }[]) {
  const out: ChartImage[] = [];
  for (const { key, title } of list) {
    const svg = root ? (root.querySelector(`[data-chart="${key}"] svg`) as SVGSVGElement | null) : null;
    if (svg) out.push({ key, title, ...(await svgToPng(svg)) });
  }
  return out;
}
