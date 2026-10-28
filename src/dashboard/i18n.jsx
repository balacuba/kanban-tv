// Đa ngôn ngữ: Tiếng Việt / English / 中文. Thêm ngôn ngữ mới = thêm một mục vào LANGS và một bộ chữ vào DICT.
// Chữ có tham số viết dạng {ten}, ví dụ t("kpi.topStageSub", { n: 3, shift: "Ca ngày" }).
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const LANGS = [
  { key: "vi", label: "VI", name: "Tiếng Việt", locale: "vi-VN" },
  { key: "en", label: "EN", name: "English", locale: "en-GB" },
  { key: "zh", label: "中文", name: "中文", locale: "zh-CN" },
];

const DICT = {
  vi: {
    "fit.on": "Xem toàn bộ trên một màn hình", "fit.off": "Thoát xem toàn bộ",
    "search.show": "Tìm kiếm", "search.hide": "Ẩn tìm kiếm", "lang": "Ngôn ngữ",
    "f.date": "Thời gian", "f.dateFrom": "Từ ngày", "f.dateTo": "Đến ngày",
    "f.shift": "Ca", "f.auto": "Tự động: {shift}", "f.hours": "Khung giờ", "f.hoursTo": "Đến khung giờ", "f.stage": "Công đoạn",
    "stages.all": "Tất cả công đoạn", "stages.allN": "Tất cả công đoạn ({n})", "stages.none": "Chưa chọn công đoạn", "stages.n": "{n} công đoạn",
    "btn.search": "Tìm kiếm", "btn.reset": "Bỏ lọc", "btn.resetTip": "Đưa bộ lọc về mặc định",
    "btn.export": "Xuất Excel", "btn.exporting": "Đang xuất…", "btn.exportTip": "Xuất dữ liệu đang xem ra file Excel",
    "shift.day": "Ca ngày", "shift.night": "Ca đêm", "nextDay": " hôm sau",
    "kpi.total": "Tổng lỗi", "kpi.rate": "Tỷ lệ lỗi", "kpi.rateSub": "Trên đầu vào", "kpi.wholeDay": "Cả ngày",
    "kpi.topDefect": "Lỗi nhiều nhất", "kpi.topDefectSub": "{n} lỗi · {p} tổng lỗi",
    "kpi.topStage": "Công đoạn lỗi nhiều nhất", "kpi.noFail": "Không có lỗi", "kpi.topStageSub": "{n} lỗi",
    "kpi.wo": "Mã WO-Line", "kpi.done": "Sản lượng hoàn thành",
    "info.product": "Sản phẩm", "info.productName": "Tên sản phẩm", "info.noData": "Không có dữ liệu để hiển thị",
    "info.model": "Thông tin model", "info.output": "Sản lượng {shiftLower}", "info.actual": "Thực tế", "info.rate": "Đạt",
    "info.enterPlan": "Nhập PlanOutput",
    "pareto.title": "Defect Distribution", "pareto.none": "Không có lỗi ở công đoạn đang chọn",
    "pareto.cum": "Tích lũy", "pareto.count": "Số lỗi", "pareto.type": "Loại lỗi",
    "pareto.tip": "#{i} {name}: {n} lỗi ({p}) · tích lũy {c}",
    "legend.main": "Thuộc nhóm lỗi chính", "legend.threshold": "- - - Ngưỡng 80%", "legend.stage": "Công đoạn:",
    "legend.count": "{a}/{b} lỗi", "legend.est": "* Số ước tính",
    "detail.in": "Input Detail", "detail.out": "Output Detail", "detail.def": "Defect Detail",
    "detail.inSub": "Đầu vào theo giờ", "detail.outSub": "Đầu ra theo giờ", "detail.defSub": "Số lỗi theo giờ",
    "chart.avg": "TB", "chart.empty": "Chưa có dữ liệu",
    "stage.title": "Kết quả theo công đoạn", "stage.time": "Thời gian", "stage.total": "Tổng {shiftLower}", "stage.noneSel": "Chưa chọn công đoạn nào",
    "app.loading": "Đang tải dữ liệu…", "app.noData": "Không có dữ liệu", "app.loadErr": "Không tải được dữ liệu: {m}",
    "app.exportErr": "Không xuất được file Excel: {m}",
    // File Excel
    "xl.overview": "Tổng quan", "xl.filters": "Bộ lọc", "xl.prodDate": "Ngày sản xuất", "xl.shift": "Ca", "xl.hours": "Khung giờ",
    "xl.stages": "Công đoạn", "xl.all": "Tất cả", "xl.paretoStage": "Top lỗi (Pareto) – công đoạn", "xl.exportedAt": "Thời điểm xuất",
    "xl.defectSummary": "Tổng quan lỗi", "xl.totalDay": "Tổng lỗi (cả ngày)", "xl.rate": "Tỷ lệ lỗi", "xl.failAt": "Lỗi tại công đoạn ({shift})",
    "xl.topDefect": "Lỗi nhiều nhất", "xl.topStage": "Công đoạn lỗi nhiều nhất", "xl.noFail": "Không có lỗi",
    "xl.products": "Sản phẩm", "xl.productName": "Tên sản phẩm", "xl.plan": "Sản lượng dự kiến", "xl.done": "Sản lượng hoàn thành", "xl.doneRate": "Tỷ lệ hoàn thành",
    "xl.actual": "Thực tế ({shift})", "xl.achieved": "Đạt",
    "xl.stageSheet": "Kết quả công đoạn", "xl.time": "Thời gian", "xl.total": "Tổng", "xl.shiftTotal": "Tổng {shiftLower}",
    "xl.paretoSheet": "Defect Pareto", "xl.defectType": "Loại lỗi", "xl.count": "Số lỗi", "xl.share": "Tỷ lệ", "xl.cum": "Tích lũy",
    "xl.mainGroup": "Nhóm lỗi chính", "xl.note": "Ghi chú", "xl.yes": "Có", "xl.est": "Số ước tính",
    "xl.hourSheet": "Theo giờ", "xl.input": "Đầu vào", "xl.output": "Đầu ra",
    "xl.chartSheet": "Biểu đồ", "xl.chartTitle": "Biểu đồ", "xl.paretoChart": "Defect Distribution (Pareto lỗi)", "xl.paretoChartStage": " – công đoạn {s}",
    "xl.inChart": "Input Detail – đầu vào theo giờ", "xl.outChart": "Output Detail – đầu ra theo giờ", "xl.defChart": "Defect Detail – số lỗi theo giờ",
  },
  en: {
    "fit.on": "Fit the whole Kanban on one screen", "fit.off": "Exit full view",
    "search.show": "Search", "search.hide": "Hide search", "lang": "Language",
    "f.date": "Date", "f.dateFrom": "From date", "f.dateTo": "To date",
    "f.shift": "Shift", "f.auto": "Auto: {shift}", "f.hours": "Time slot", "f.hoursTo": "To time slot", "f.stage": "Stage",
    "stages.all": "All stages", "stages.allN": "All stages ({n})", "stages.none": "No stage selected", "stages.n": "{n} stages",
    "btn.search": "Search", "btn.reset": "Reset", "btn.resetTip": "Reset filters to default",
    "btn.export": "Export Excel", "btn.exporting": "Exporting…", "btn.exportTip": "Export the current view to an Excel file",
    "shift.day": "Day shift", "shift.night": "Night shift", "nextDay": " next day",
    "kpi.total": "Total defects", "kpi.rate": "Defect rate", "kpi.rateSub": "Of input", "kpi.wholeDay": "Whole day",
    "kpi.topDefect": "Top defect", "kpi.topDefectSub": "{n} defects · {p} of total",
    "kpi.topStage": "Top failing stage", "kpi.noFail": "No fails", "kpi.topStageSub": "{n} fails",
    "kpi.wo": "WO-Line code", "kpi.done": "Completed output",
    "info.product": "Product", "info.productName": "Product name", "info.noData": "No data to display",
    "info.model": "Model info", "info.output": "{shift} output", "info.actual": "Actual", "info.rate": "Achieved",
    "info.enterPlan": "Enter PlanOutput",
    "pareto.title": "Defect Distribution", "pareto.none": "No defects at the selected stages",
    "pareto.cum": "Cumulative", "pareto.count": "Defects", "pareto.type": "Defect type",
    "pareto.tip": "#{i} {name}: {n} defects ({p}) · cumulative {c}",
    "legend.main": "Main defect group", "legend.threshold": "- - - 80% threshold", "legend.stage": "Stage:",
    "legend.count": "{a}/{b} defects", "legend.est": "* Estimated",
    "detail.in": "Input Detail", "detail.out": "Output Detail", "detail.def": "Defect Detail",
    "detail.inSub": "Input by hour", "detail.outSub": "Output by hour", "detail.defSub": "Defects by hour",
    "chart.avg": "Avg", "chart.empty": "No data yet",
    "stage.title": "Results by stage", "stage.time": "Time", "stage.total": "{shift} total", "stage.noneSel": "No stage selected",
    "app.loading": "Loading data…", "app.noData": "No data", "app.loadErr": "Could not load data: {m}",
    "app.exportErr": "Could not export the Excel file: {m}",
    "xl.overview": "Overview", "xl.filters": "Filters", "xl.prodDate": "Production date", "xl.shift": "Shift", "xl.hours": "Time slot",
    "xl.stages": "Stages", "xl.all": "All", "xl.paretoStage": "Top defects (Pareto) – stage", "xl.exportedAt": "Exported at",
    "xl.defectSummary": "Defect summary", "xl.totalDay": "Total defects (whole day)", "xl.rate": "Defect rate", "xl.failAt": "Stage fails ({shift})",
    "xl.topDefect": "Top defect", "xl.topStage": "Top failing stage", "xl.noFail": "No fails",
    "xl.products": "Products", "xl.productName": "Product name", "xl.plan": "Planned output", "xl.done": "Completed output", "xl.doneRate": "Completion rate",
    "xl.actual": "Actual ({shift})", "xl.achieved": "Achieved",
    "xl.stageSheet": "Stage results", "xl.time": "Time", "xl.total": "Total", "xl.shiftTotal": "{shift} total",
    "xl.paretoSheet": "Defect Pareto", "xl.defectType": "Defect type", "xl.count": "Defects", "xl.share": "Share", "xl.cum": "Cumulative",
    "xl.mainGroup": "Main group", "xl.note": "Note", "xl.yes": "Yes", "xl.est": "Estimated",
    "xl.hourSheet": "By hour", "xl.input": "Input", "xl.output": "Output",
    "xl.chartSheet": "Charts", "xl.chartTitle": "Charts", "xl.paretoChart": "Defect Distribution (Pareto)", "xl.paretoChartStage": " – stage {s}",
    "xl.inChart": "Input Detail – input by hour", "xl.outChart": "Output Detail – output by hour", "xl.defChart": "Defect Detail – defects by hour",
  },
  zh: {
    "fit.on": "在一个屏幕上显示整个看板", "fit.off": "退出全屏显示",
    "search.show": "搜索", "search.hide": "隐藏搜索", "lang": "语言",
    "f.date": "日期", "f.dateFrom": "开始日期", "f.dateTo": "结束日期",
    "f.shift": "班次", "f.auto": "自动：{shift}", "f.hours": "时段", "f.hoursTo": "结束时段", "f.stage": "工序",
    "stages.all": "全部工序", "stages.allN": "全部工序（{n}）", "stages.none": "未选择工序", "stages.n": "{n} 个工序",
    "btn.search": "搜索", "btn.reset": "重置", "btn.resetTip": "恢复默认筛选",
    "btn.export": "导出 Excel", "btn.exporting": "正在导出…", "btn.exportTip": "将当前数据导出为 Excel 文件",
    "shift.day": "白班", "shift.night": "夜班", "nextDay": "（次日）",
    "kpi.total": "不良总数", "kpi.rate": "不良率", "kpi.rateSub": "占投入", "kpi.wholeDay": "全天",
    "kpi.topDefect": "最多不良", "kpi.topDefectSub": "{n} 个 · 占总不良 {p}",
    "kpi.topStage": "不良最多工序", "kpi.noFail": "无不良", "kpi.topStageSub": "{n} 个不良",
    "kpi.wo": "WO-Line 编号", "kpi.done": "完成产量",
    "info.product": "产品", "info.productName": "产品名称", "info.noData": "暂无数据",
    "info.model": "机型信息", "info.output": "{shift}产量", "info.actual": "实际", "info.rate": "达成率",
    "info.enterPlan": "请输入 PlanOutput",
    "pareto.title": "不良分布", "pareto.none": "所选工序无不良",
    "pareto.cum": "累计", "pareto.count": "不良数", "pareto.type": "不良类型",
    "pareto.tip": "#{i} {name}：{n} 个（{p}）· 累计 {c}",
    "legend.main": "主要不良", "legend.threshold": "- - - 80% 阈值", "legend.stage": "工序：",
    "legend.count": "{a}/{b} 个不良", "legend.est": "* 估计值",
    "detail.in": "投入明细", "detail.out": "产出明细", "detail.def": "不良明细",
    "detail.inSub": "每小时投入", "detail.outSub": "每小时产出", "detail.defSub": "每小时不良",
    "chart.avg": "均值", "chart.empty": "暂无数据",
    "stage.title": "各工序结果", "stage.time": "时间", "stage.total": "{shift}合计", "stage.noneSel": "未选择工序",
    "app.loading": "正在加载数据…", "app.noData": "暂无数据", "app.loadErr": "数据加载失败：{m}",
    "app.exportErr": "Excel 导出失败：{m}",
    "xl.overview": "概览", "xl.filters": "筛选条件", "xl.prodDate": "生产日期", "xl.shift": "班次", "xl.hours": "时段",
    "xl.stages": "工序", "xl.all": "全部", "xl.paretoStage": "主要不良（柏拉图）– 工序", "xl.exportedAt": "导出时间",
    "xl.defectSummary": "不良概况", "xl.totalDay": "不良总数（全天）", "xl.rate": "不良率", "xl.failAt": "工序不良（{shift}）",
    "xl.topDefect": "最多不良", "xl.topStage": "不良最多工序", "xl.noFail": "无不良",
    "xl.products": "产品", "xl.productName": "产品名称", "xl.plan": "计划产量", "xl.done": "完成产量", "xl.doneRate": "完成率",
    "xl.actual": "实际（{shift}）", "xl.achieved": "达成率",
    "xl.stageSheet": "工序结果", "xl.time": "时间", "xl.total": "合计", "xl.shiftTotal": "{shift}合计",
    "xl.paretoSheet": "不良柏拉图", "xl.defectType": "不良类型", "xl.count": "不良数", "xl.share": "占比", "xl.cum": "累计",
    "xl.mainGroup": "主要不良", "xl.note": "备注", "xl.yes": "是", "xl.est": "估计值",
    "xl.hourSheet": "按小时", "xl.input": "投入", "xl.output": "产出",
    "xl.chartSheet": "图表", "xl.chartTitle": "图表", "xl.paretoChart": "不良分布（柏拉图）", "xl.paretoChartStage": " – 工序 {s}",
    "xl.inChart": "投入明细 – 每小时投入", "xl.outChart": "产出明细 – 每小时产出", "xl.defChart": "不良明细 – 每小时不良",
  },
};

// Dịch một khóa; thiếu bản dịch thì dùng tiếng Việt, thiếu nữa thì trả về chính khóa
export function translate(lang, key, params) {
  const s = DICT[lang]?.[key] ?? DICT.vi[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m)) : s;
}

const STORE_KEY = "kanban-lang";
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch { /* bỏ qua */ }
    return LANGS.some(l => l.key === saved) ? saved : "vi";
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORE_KEY, lang); } catch { /* bỏ qua */ }
  }, [lang]);
  const value = useMemo(() => {
    const t = (key, params) => translate(lang, key, params);
    // Tên ca theo ngôn ngữ; shiftLower dùng giữa câu tiếng Việt ("Sản lượng ca ngày")
    const shiftText = s => {
      const name = t(`shift.${s.key}`);
      return { shift: name, shiftLower: lang === "vi" ? name.toLowerCase() : name };
    };
    return { lang, setLang, t, shiftText, locale: LANGS.find(l => l.key === lang).locale };
  }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
