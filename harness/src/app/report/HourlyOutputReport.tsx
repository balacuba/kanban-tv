import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./HourlyOutputReport.css";
import axios from "axios";
import { toast } from "react-toastify";
import { registerScreen } from "@haulmont/jmix-react-ui";
import { useMainStore } from "@haulmont/jmix-react-core";
import { PLANNING_API_URL } from "../../config";
import logo from "./mkvision-logo.png";
import { HourlyOutputPieChart, toDefectList, useErrorNames } from "./chart/hourlyOutput/HourlyOutputPieChart";
import { buildPareto } from "./chart/hourlyOutput/ErrorParetoChart";
import HourlyPassOutputChart from "./chart/hourlyOutput/HourlyPassOutputChart";
import HourlyCompleteOutputChart from "./chart/hourlyOutput/HourlyCompleteOutputChart";
import HourlyFailOutputChart from "./chart/hourlyOutput/HourlyFailOutputChart";
import { exportKanbanExcel } from "./chart/hourlyOutput/KanbanExcel";
import {
  HOURS, I18nProvider, LANGS, MAX_DAYS, REFRESH_MS, SHIFTS, SLOTS, SLOT_HOUR,
  addDays, captureCharts, fmt, listDays, num, pct, productionDate, rangeLabel, shiftRange, shiftSlots, slotOf, sum,
  useClickOutside, useCurrentShift, useFitToScreen, useI18n
} from "./chart/hourlyOutput/KanbanShared";

/**
 * Kanban theo dõi lỗi / sản lượng theo giờ của một WO-Line.
 * Dữ liệu lấy từ các API cũ của màn HourlyOutputReport:
 *  - PlanningWorkOrder/search                          : danh sách WO-Line
 *  - production-report/get-common-info/{wo}            : sản phẩm, sản lượng, danh sách công đoạn
 *  - production-report/get-daily-report?wo&date        : bảng theo giờ (mỗi ngày một lần gọi), lỗi theo giờ, hoàn thành theo giờ, danh sách lỗi
 *  - ProductSerialNumberTestHistory/search             : từng lần test lỗi (mã lỗi, công đoạn, giờ) để Defect Distribution
 *                                                        lọc được theo công đoạn / ca / khung giờ
 *  - MDM /api/errors (trong HourlyOutputPieChart)      : tên lỗi
 * Tự tải lại mỗi 30 giây và tự chuyển ca ngày / ca đêm theo giờ máy.
 */

/* ================= Dữ liệu ================= */
interface Stage { name: string; key: string; }
interface KanbanData {
  woCode: string;
  productName: string;
  productCode: string;
  plan: number;              // sản lượng dự kiến
  done: number;              // sản lượng hoàn thành
  stages: Stage[];
  rows: number[][][];        // [khung giờ trong SLOTS][công đoạn] = [pass, fail]
  outside: number[][];       // dòng "Ngoài khung giờ": [công đoạn] = [pass, fail]
  hasOutside: boolean;
  outputByHour: number[];    // completeQuantity theo khung giờ
  failByHour: number[];      // totalFail theo khung giờ
  hasFailTable: boolean;
  errorList: { errorCode: string; errorCount: number }[];
  // Từng lỗi kèm công đoạn + khung giờ (null = không tải được, Pareto dùng errorList cả ngày)
  defectRecords: DefectRecord[] | null;
}
interface DefectRecord { code: string; stage: string; slot: number; }
interface Query { woLine: string; dateFrom: string; dateTo: string; }

// Lịch sử test có mã lỗi của WO trong các ngày đang xem (ProductSerialNumberTestHistory).
// Chỉ tính bản ghi tại trạm sửa ("R_ICT" → công đoạn "ICT"): mỗi bản ghi là một lỗi đã ghi nhận, cùng cách đếm với
// cột Fail của get-daily-report (stageN_fail = số bản ghi "R_<công đoạn>"). Bản ghi test NG tại chính công đoạn
// (vd. "ICT", testResult = 2) là cùng lỗi đó trước khi sửa, nên không tính để không đếm trùng.
const HISTORY_PAGE = 5000;
async function fetchDefectRecords(wo: string, days: string[], auth: any): Promise<DefectRecord[]> {
  const out: DefectRecord[] = [];
  for (let offset = 0; offset < HISTORY_PAGE * 20; offset += HISTORY_PAGE) {
    const res = await axios.post(`${PLANNING_API_URL}/rest/entities/ProductSerialNumberTestHistory/search`, {
      filter: {
        conditions: [
          { property: "workOrderCode", operator: "=", value: wo },
          { property: "testTime", operator: ">=", value: `${days[0]}T00:00:00` },
          { property: "testTime", operator: "<", value: `${addDays(days[days.length - 1], 1)}T00:00:00` },
          { property: "errorCode", operator: "notEmpty" }
        ]
      },
      sort: "testTime",
      limit: HISTORY_PAGE,
      offset
    }, auth);
    const rows = asArray(res.data);
    rows.forEach((r: any) => {
      const stageName = String(r.stageName || "").trim();
      if (!/^R_/.test(stageName)) return;
      const hour = Number(String(r.testTime || "").slice(11, 13));
      const stage = stageName.replace(/^R_/, "");
      String(r.errorCode || "").split(/[,;]/).map(s => s.trim()).filter(Boolean)
        .forEach(code => out.push({ code, stage, slot: SLOT_HOUR.indexOf(hour) }));
    });
    if (rows.length < HISTORY_PAGE) break;
  }
  return out;
}

const zeros = (n: number) => {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(0);
  return a;
};
const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);

// Gộp kết quả get-common-info + get-daily-report (một hoặc nhiều ngày) thành dữ liệu cho Kanban
function buildKanbanData(woCode: string, common: any, reports: any[], defectRecords: DefectRecord[] | null): KanbanData {
  const stages: Stage[] = asArray(common.stageNameList).map((s: any) => ({ name: String(s.stage_name ?? ""), key: String(s.stage_key ?? "") }));
  const rows = SLOTS.map(() => stages.map(() => [0, 0]));
  const outside = stages.map(() => [0, 0]);
  const outputByHour = zeros(SLOTS.length);
  const failByHour = zeros(SLOTS.length);
  const errors = new Map<string, number>();
  let hasOutside = false, hasFailTable = false;

  reports.forEach(rep => {
    asArray(rep.detailTable).forEach((r: any) => {
      const h = slotOf(r.testTime);
      const target = h < 0 ? outside : rows[h];
      // Pass / Fail lấy đúng số của API (stageN_pass / stageN_fail), giống màn cũ
      stages.forEach((s, j) => {
        const p = num(r[`${s.key}_pass`]), f = num(r[`${s.key}_fail`]);
        target[j][0] += p;
        target[j][1] += f;
        if (h < 0 && (p || f)) hasOutside = true;
      });
    });
    asArray(rep.completeQuantity).forEach((r: any) => {
      const h = slotOf(r.testTime);
      if (h >= 0) outputByHour[h] += num(r.completeQuantity);
    });
    asArray(rep.defectDetailTable).forEach((r: any) => {
      hasFailTable = true;
      const h = slotOf(r.testTime);
      if (h >= 0) failByHour[h] += num(r.totalFail);
    });
    asArray(rep.errorList).forEach((e: any) => {
      const code = String(e?.errorCode ?? "");
      errors.set(code, (errors.get(code) || 0) + num(e?.errorCount));
    });
  });

  return {
    woCode,
    productName: String(common.productName ?? ""),
    productCode: String(common.productCode ?? ""),
    plan: num(common.expectedQuantity),
    done: num(common.completedQuantity),
    stages, rows, outside, hasOutside, outputByHour, failByHour, hasFailTable,
    errorList: Array.from(errors, ([errorCode, errorCount]) => ({ errorCode, errorCount })),
    defectRecords
  };
}

// Số liệu cho ca đang xem sau khi lọc khung giờ + công đoạn
function computeView(d: KanbanData, shiftIndex: number, from: number, to: number, sel: number[]) {
  const hrs = shiftSlots(shiftIndex).filter(i => i >= from && i <= to);
  const rows = hrs.map(h => ({ slot: SLOTS[h], cells: sel.map(j => d.rows[h][j]) }));
  const totals = sel.map((_, k) => [sum(rows.map(r => r.cells[k][0])), sum(rows.map(r => r.cells[k][1]))]);
  // Đủ công đoạn thì dùng tổng lỗi theo giờ của backend; đang lọc công đoạn thì cộng Fail các công đoạn đang chọn
  const useBackendFail = sel.length === d.stages.length && d.hasFailTable;
  const failByHour = hrs.map((h, k) => (useBackendFail ? d.failByHour[h] : sum(rows[k].cells.map(c => c[1]))));
  return {
    hrs,
    rows,
    totals,
    failByStage: totals.map(c => c[1]),
    failByHour,
    totalFail: sum(failByHour),
    labels: hrs.map(h => HOURS[h]),
    input: hrs.map(h => (d.stages.length ? d.rows[h][0][0] : 0)),   // Input = Pass công đoạn đầu (stage0_pass)
    output: hrs.map(h => d.outputByHour[h])
  };
}

// OutputGroup của PM Plan: công đoạn "VMI" (như màn cũ); không có thì lấy công đoạn cuối
const outputStageIndex = (stages: Stage[]) => {
  const i = stages.findIndex(s => s.name.trim().toUpperCase() === "VMI");
  return i >= 0 ? i : stages.length - 1;
};

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.result?.message || err?.response?.data?.message || err?.message || fallback;

/* ================= Thanh trên + bộ lọc ================= */
function StageMultiSelect({ stages, selected, onChange }: { stages: string[]; selected: number[]; onChange: (v: number[]) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const n = selected.length;
  const all = n === stages.length;
  const summary = all ? t("stages.allN", { n })
    : n === 0 ? t("stages.none") : n === 1 ? stages[selected[0]] : t("stages.n", { n });
  const toggle = (i: number) =>
    onChange(selected.indexOf(i) >= 0 ? selected.filter(x => x !== i) : selected.concat([i]).sort((a, b) => a - b));

  return (
    <div className="multi" ref={ref}>
      <button type="button" className={`multi-summary${open ? " open" : ""}`} onClick={() => setOpen(o => !o)}>
        {summary}
      </button>
      {open && (
        <div className="multi-menu">
          <label className="all">
            <input
              type="checkbox"
              checked={all}
              ref={el => { if (el) el.indeterminate = n > 0 && !all; }}
              onChange={e => onChange(e.target.checked ? stages.map((_, i) => i) : [])}
            />
            {t("stages.all")}
          </label>
          {stages.map((s, i) => (
            <label key={s + i}>
              <input type="checkbox" checked={selected.indexOf(i) >= 0} onChange={() => toggle(i)} /> {s}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Ô chọn WO-Line: bấm vào là xổ toàn bộ danh sách, gõ để lọc, chọn một dòng là tải WO đó ngay.
// Phím ↑ ↓ để di chuyển, Enter để chọn (hoặc tìm theo mã đang gõ), Esc để đóng.
const WO_MENU_MAX = 300; // số dòng hiện tối đa trong danh sách (gõ thêm để lọc)

function WoCombo({ items, value, onChange, onPick, placeholder }: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  onPick: (v: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");   // chữ đang gõ để lọc; rỗng = hiện tất cả
  const [hi, setHi] = useState(0);          // dòng đang được chọn bằng bàn phím
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const q = query.trim().toLowerCase();
  const list = (q ? items.filter(w => w.toLowerCase().indexOf(q) >= 0) : items).slice(0, WO_MENU_MAX);

  const show = () => {
    setQuery("");
    setHi(Math.max(0, items.indexOf(value)));
    setOpen(true);
  };
  const pick = (w: string) => {
    onChange(w);
    setOpen(false);
    onPick(w);
  };

  // Giữ dòng đang chọn luôn nhìn thấy trong danh sách
  useEffect(() => {
    const el = listRef.current && (listRef.current.children[hi] as HTMLElement | undefined);
    if (open && el) el.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  return (
    <div className="wo-combo" ref={ref}>
      <input
        id="wd-wo" className="wo-input" autoComplete="off" value={value} placeholder={placeholder}
        role="combobox" aria-expanded={open} aria-controls="wd-wo-menu"
        onFocus={show}
        onClick={() => { if (!open) show(); }}
        onChange={e => { onChange(e.target.value); setQuery(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) show(); else setHi(i => Math.min(list.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); if (open && list[hi]) pick(list[hi]); else { setOpen(false); onPick(value); } }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      <button type="button" className={`wo-combo-btn${open ? " open" : ""}`} tabIndex={-1} aria-label="WO-Line"
        onClick={() => (open ? setOpen(false) : show())} />
      {open && (
        <ul className="wo-menu" id="wd-wo-menu" role="listbox" ref={listRef}>
          {list.length ? list.map((w, i) => (
            <li key={w} role="option" aria-selected={w === value}
              className={`${i === hi ? "hi" : ""}${w === value ? " sel" : ""}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={e => { e.preventDefault(); pick(w); }}>
              {w}
            </li>
          )) : <li className="none">—</li>}
        </ul>
      )}
    </div>
  );
}

// Nút chọn ngôn ngữ: VI / EN / 中文, ngôn ngữ đang dùng được tô đậm
function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang")} title={t("lang")}>
      {LANGS.map(l => (
        <button key={l.key} type="button" className={l.key === lang ? "on" : undefined}
          aria-pressed={l.key === lang} title={l.name} onClick={() => setLang(l.key)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

interface FilterBarProps {
  open: boolean;
  onOpen: (v: boolean) => void;
  woLines: string[];
  woLine: string;
  onWoLine: (v: string) => void;
  dates: { from: string; to: string };
  onDates: (a: string, b: string) => void;
  shiftMode: string;
  autoShift: number;
  onShiftMode: (v: string) => void;
  slotOptions: number[];
  from: number;
  to: number;
  onRange: (a: number, b: number) => void;
  stages: string[];
  selectedStages: number[];
  onStages: (v: number[]) => void;
  onSearch: (wo?: string) => void;
  onReset: () => void;
  onExport: (() => void) | null;
  exporting: boolean;
  fit: boolean;
  onToggleFit: () => void;
}

function FilterBar(p: FilterBarProps) {
  const { t } = useI18n();
  return (
    <header className="wd-header">
      {/* Hàng trên: logo bên trái, tiêu đề ở giữa, ngôn ngữ + nút bên phải; hàng dưới: bộ lọc (ẩn, bấm kính lúp mới hiện) */}
      <div className="wd-topbar">
        <img className="brand-logo" src={logo} alt="MK Vision" />
        <h1 className="brand-name"><span className="brand-text">Kanban</span></h1>
        <div className="topbar-actions">
          <LangSwitch />
          <button type="button" className={`search-toggle${p.fit ? " on" : ""}`} onClick={p.onToggleFit}
            aria-pressed={p.fit} title={p.fit ? t("fit.off") : t("fit.on")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {p.fit
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
          <button type="button" className={`search-toggle${p.open ? " on" : ""}`} onClick={() => p.onOpen(!p.open)}
            aria-expanded={p.open} aria-controls="wd-filters" title={p.open ? t("search.hide") : t("search.show")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {p.open ? <path d="M6 6l12 12M18 6 6 18" /> : <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>}
            </svg>
          </button>
        </div>
      </div>
      {p.open && (
        <div className="filters" id="wd-filters">
          <div className="field">
            <label htmlFor="wd-wo">{t("f.wo")}</label>
            <WoCombo items={p.woLines} value={p.woLine} onChange={p.onWoLine} onPick={w => p.onSearch(w)}
              placeholder={t("f.woPlaceholder")} />
          </div>
          <div className="field">
            <label htmlFor="wd-date">{t("f.date")}</label>
            {/* Lọc từ ngày → đến ngày; chọn ngược thì tự đảo lại */}
            <div className="range date-range">
              <input id="wd-date" type="date" value={p.dates.from} max={p.dates.to}
                onChange={e => e.target.value && p.onDates(e.target.value, p.dates.to)} aria-label={t("f.dateFrom")} />
              <span className="range-sep">→</span>
              <input type="date" value={p.dates.to} min={p.dates.from}
                onChange={e => e.target.value && p.onDates(p.dates.from, e.target.value)} aria-label={t("f.dateTo")} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="wd-shift">{t("f.shift")}</label>
            <select id="wd-shift" className="shift-sel" value={p.shiftMode} onChange={e => p.onShiftMode(e.target.value)}>
              <option value="auto">{t("f.auto", { shift: t(`shift.${SHIFTS[p.autoShift].key}`) })}</option>
              {SHIFTS.map((s, si) => <option key={s.key} value={String(si)}>{t(`shift.${s.key}`)} ({shiftRange(s, t("nextDay"))})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wd-from">{t("f.hours")}</label>
            <div className="range">
              <select id="wd-from" value={p.from} onChange={e => p.onRange(+e.target.value, p.to)}>
                {p.slotOptions.map(i => <option key={i} value={i}>{SLOTS[i]}</option>)}
              </select>
              <span className="range-sep">→</span>
              <select value={p.to} onChange={e => p.onRange(p.from, +e.target.value)} aria-label={t("f.hoursTo")}>
                {p.slotOptions.map(i => <option key={i} value={i}>{SLOTS[i]}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>{t("f.stage")}</label>
            <StageMultiSelect stages={p.stages} selected={p.selectedStages} onChange={p.onStages} />
          </div>
          <div className="filter-actions">
            <button type="button" className="btn" onClick={() => p.onSearch()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              {t("btn.search")}
            </button>
            <button type="button" className="btn ghost" onClick={p.onReset} title={t("btn.resetTip")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
              {t("btn.reset")}
            </button>
            <button type="button" className="btn excel" onClick={p.onExport || undefined} disabled={!p.onExport || p.exporting}
              title={t("btn.exportTip")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></svg>
              {p.exporting ? t("btn.exporting") : t("btn.export")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ================= Thẻ chỉ số ================= */
const KPI_ICONS: { [k: string]: React.ReactNode } = {
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></>
};

const KpiIcon = ({ name, tone }: { name: string; tone: string }) => (
  <span className={`kpi-icon ${tone}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{KPI_ICONS[name]}</svg>
  </span>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="hero-stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
  </div>
);

function KpiCards({ totalDefects, topDefect, topStage, woCode, plan, done }: {
  totalDefects: number;
  topDefect?: { name: string; count: number; share: number };
  topStage: { name: string; fail: number } | null;
  woCode: string;
  plan: number;
  done: number;
}) {
  const { t } = useI18n();
  const donePct = plan ? done / plan : 0;
  return (
    <section className="kpis">
      <div className="card kpi hero">
        {/* Chỉ còn Tổng lỗi: đã bỏ ô Tỷ lệ lỗi (số OK lấy từ công đoạn đầu không tin cậy khi công đoạn đầu ít chạy) */}
        <Stat label={t("kpi.total")} value={fmt(totalDefects)} />
      </div>

      <div className="card kpi">
        <KpiIcon name="alert" tone="red" />
        <div className="kpi-body">
          <span className="label">{t("kpi.topDefect")}</span>
          <span className="value red" title={topDefect?.name}>{topDefect ? topDefect.name : "—"}</span>
          {topDefect && <span className="sub">{t("kpi.topDefectSub", { n: topDefect.count, p: pct(topDefect.share, 1) })}</span>}
        </div>
      </div>

      <div className="card kpi">
        <KpiIcon name="layers" tone="amber" />
        <div className="kpi-body">
          <span className="label" title={t("kpi.topStage")}>{t("kpi.topStage")}</span>
          <span className="value red" title={topStage ? topStage.name : undefined}>{topStage ? topStage.name : t("kpi.noFail")}</span>
          {/* Số lỗi của công đoạn + % trên tổng lỗi của ca đang xem */}
          {topStage && <span className="sub">{t("kpi.topStageSub", { n: topStage.fail, p: pct(topStage.fail, totalDefects, 1) })}</span>}
        </div>
      </div>

      <div className="card kpi">
        <KpiIcon name="tag" tone="blue" />
        <div className="kpi-body">
          <span className="label">{t("kpi.wo")}</span>
          <span className="value" title={woCode}>{woCode || "—"}</span>
        </div>
      </div>

      <div className="card kpi">
        <KpiIcon name="box" tone="green" />
        <div className="kpi-body">
          <span className="label" title={t("kpi.done")}>{t("kpi.done")}</span>
          <span className="value">{fmt(done)} <small>/ {fmt(plan)}</small></span>
          <div className="meter">
            <div className="meter-track"><div className="meter-fill" style={{ width: pct(Math.min(donePct, 1), 1, 1) }} /></div>
            <span className="meter-pct">{pct(donePct, 1, 1)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= Sản phẩm + PM Plan ================= */
// Ô nhập PlanOutput: sửa thoải mái, chỉ lưu khi rời ô hoặc bấm Enter
function PlanInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value || 0));
  useEffect(() => setDraft(String(value || 0)), [value]);
  const commit = () => {
    const n = Math.max(0, Math.round(Number(draft.replace(/[^\d]/g, "")) || 0));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      className="plan-input" inputMode="numeric" value={draft} aria-label="PlanOutput"
      // Ô tự co giãn theo số ký tự đang nhập (tối thiểu 3 ký tự); thêm 1ch vì số in đậm rộng hơn 1ch
      style={{ width: `calc(${Math.max(3, draft.length) + 1}ch + 26px)` }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

// Màu mức đạt: >= 100% xanh, >= 80% vàng, dưới 80% đỏ
const tone = (r: number) => (r >= 1 ? "good" : r >= 0.8 ? "warn" : "bad");

const TitleIcon = ({ children }: { children: React.ReactNode }) =>
  <span className="title-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg></span>;

function InfoTables({ productName, pmPlan, shiftText, planOutput, onPlanOutput, shiftOutput }: {
  productName: string;
  pmPlan: { model: string; inputGroup: string; outputGroup: string }[];
  shiftText: { shift: string; shiftLower: string };
  planOutput: number;
  onPlanOutput: (v: number) => void;
  shiftOutput: number;
}) {
  const { t } = useI18n();
  const rate = planOutput ? shiftOutput / planOutput : 0;
  return (
    <section className="info-row">
      {/* Sản phẩm: tông xanh dương, chỉ có tên sản phẩm nằm giữa thẻ */}
      <div className="card info-card product">
        <h2 className="card-title">
          <span className="title-main">
            <TitleIcon><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></TitleIcon>
            {t("info.product")}
          </span>
        </h2>
        {/* Khối đơn giản (không dùng bảng) + class riêng product-body: CSS của ứng dụng chứa Kanban
            (card-body / table / td) không làm mất tên sản phẩm */}
        <div className="card-body product-body">
          {productName
            ? <div className="product-name"><span className="product-badge">{productName}</span></div>
            : <div className="product-name product-empty">{t("info.noData")}</div>}
        </div>
      </div>

      {/* PM Plan: tông vàng cam; nhóm "Thông tin model" và nhóm "Sản lượng ca" tách bằng tiêu đề nhóm + nền */}
      <div className="card info-card plan">
        <h2 className="card-title">
          <span className="title-main">
            <TitleIcon><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4M16 2v4M4 10h16" /><path d="m9 15 2 2 4-4" /></TitleIcon>
            PM Plan
          </span>
        </h2>
        <div className="card-body">
          <table className="info-table">
            <thead>
              <tr className="group-row">
                <th colSpan={3} className="grp-model">{t("info.model")}</th>
                <th colSpan={3} className="grp-plan">{t("info.output", shiftText)}</th>
              </tr>
              <tr>
                <th className="grp-model">Model Name</th><th className="grp-model">InputGroup</th><th className="grp-model">OutputGroup</th>
                <th className="grp-plan">PlanOutput</th><th className="grp-plan">{t("info.actual")}</th><th className="grp-plan rate-col">{t("info.rate")}</th>
              </tr>
            </thead>
            <tbody>
              {pmPlan.length ? pmPlan.map(p => (
                <tr key={p.model}>
                  <td className="strong">{p.model}</td>
                  <td><span className="chip">{p.inputGroup}</span></td>
                  <td><span className="chip">{p.outputGroup}</span></td>
                  <td className="plan-cell"><PlanInput value={planOutput} onCommit={onPlanOutput} /></td>
                  <td className="plan-cell num">{fmt(shiftOutput)}</td>
                  <td className="plan-cell rate-col">
                    {planOutput > 0 ? (
                      <div className={`rate ${tone(rate)}`}>
                        <div className="rate-track"><div className="rate-fill" style={{ width: pct(Math.min(rate, 1), 1, 1) }} /></div>
                        <b>{pct(rate, 1, 1)}</b>
                      </div>
                    ) : <span className="hint">{t("info.enterPlan")}</span>}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">{t("app.noData")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ================= Bảng kết quả theo công đoạn ================= */
// Mật độ bảng theo số công đoạn: ít thì rộng rãi, nhiều (tới ~20) thì thu nhỏ chữ/khoảng cách để vừa khung
const stageDensity = (n: number) => (n <= 8 ? "normal" : n <= 14 ? "compact" : "dense");

// Pass và Fail chung một ô dạng "pass / fail"
const Cells = ({ cells }: { cells: number[][] }) => (
  <>
    {cells.map((c, j) => (
      <td key={j} className={`pf${c[1] > 0 ? " hit" : ""}`} title={`Pass ${fmt(c[0])} · Fail ${c[1]}`}>
        <span className="pf-one">
          <span className="pv">{fmt(c[0])}</span>
          <span className="sep">/</span>
          <span className="fv">{c[1]}</span>
        </span>
      </td>
    ))}
  </>
);

function StageTable({ stageNames, rows, outside, noStages, totals }: {
  stageNames: string[];
  rows: { slot: string; cells: number[][] }[];
  outside: number[][] | null;
  noStages: boolean;   // WO-Line chưa cấu hình công đoạn nào (khác với người dùng bỏ chọn hết)
  totals: number[][];  // [Pass, Fail] từng công đoạn trong ca / khung giờ đang xem (= dòng Tổng)
}) {
  const { t } = useI18n();
  // Phần pass và phần fail rộng bằng nhau (theo số dài nhất cả bảng): đầu số thẳng cột, dấu "/" nằm chính giữa ô
  const all = rows.reduce((acc: number[][], r) => acc.concat(r.cells), []).concat(outside || [], totals);
  const nw = Math.max(1, ...all.map(c => Math.max(fmt(c[0]).length, String(c[1]).length)));
  const width = { ["--nw" as any]: `${nw}ch` } as React.CSSProperties;
  return (
    <section className="card stage-card">
      <h2 className="card-title center defect-title blue">
        <span className="defect-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></svg>
        </span>
        {t("stage.title")}
      </h2>
      <div className="card-body stage-scroll">
        <table className={`stage-table ${stageDensity(stageNames.length)}`} style={width}>
          <thead>
            <tr>
              <th className="time">{t("stage.time")}</th>
              {/* Dưới tên công đoạn: số lỗi · tỷ lệ lỗi của chính công đoạn = Fail / (Pass + Fail) trong ca đang xem */}
              {stageNames.map((s, i) => {
                const [pass, fail] = totals[i] || [0, 0];
                return (
                  <th key={s + i} className="stage" title={s}>
                    {s}
                    <span className={`stage-share${fail > 0 ? " hit" : ""}`}>
                      {t("stage.share", { n: fmt(fail), p: pct(fail, pass + fail, 1) })}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!stageNames.length ? (
              <tr><td className="time" /><td className="empty">{t(noStages ? "stage.noStages" : "stage.noneSel")}</td></tr>
            ) : (
              <>
                {rows.map(({ slot, cells }) => (
                  <tr key={slot} className={cells.every(c => !c[0] && !c[1]) ? "idle" : undefined}>
                    <td className="time">{slot}</td>
                    <Cells cells={cells} />
                  </tr>
                ))}
                {/* Dòng Tổng: tổng Pass / Fail từng công đoạn trong các khung giờ đang xem */}
                <tr className="total">
                  <td className="time">{t("xl.total")}</td>
                  <Cells cells={totals} />
                </tr>
                {/* Dữ liệu ngoài khung giờ ca: hiện riêng dưới dòng tổng (không cộng vào tổng) */}
                {outside && (
                  <tr className="outside">
                    <td className="time">{t("stage.outside")}</td>
                    <Cells cells={outside} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ================= Màn hình Kanban ================= */
const KanbanScreen = () => {
  const { t, shiftText, locale } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const mainStore = useMainStore();
  const authToken: string | undefined = mainStore.authToken;
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ---------- Bộ lọc ----------
  const [woLines, setWoLines] = useState<string[]>([]);
  const [woLine, setWoLine] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dates, setDates] = useState(() => ({ from: productionDate(), to: productionDate() }));
  const [query, setQuery] = useState<Query | null>(null);   // bộ lọc đã "Tìm kiếm" (dùng để tải dữ liệu)
  const [reloadKey, setReloadKey] = useState(0);
  const [shiftMode, setShiftMode] = useState("auto");      // "auto" | "0" | "1"
  const [range, setRange] = useState<{ from: number; to: number } | null>(null); // null = cả ca
  const [stageSel, setStageSel] = useState<number[] | null>(null);              // null = tất cả công đoạn
  const onDates = (a: string, b: string) => setDates(a <= b ? { from: a, to: b } : { from: b, to: a });

  // ---------- Dữ liệu ----------
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(false);

  // Chế độ "Xem toàn bộ": mặc định bật trên màn hình máy tính (≥ 1024px); người dùng tắt thì nhớ lựa chọn
  const [fit, setFit] = useState(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("kanban-fit"); } catch { /* bỏ qua */ }
    return saved === null ? window.innerWidth >= 1024 : saved === "1";
  });
  useFitToScreen(rootRef, fit);
  const onToggleFit = () => {
    const next = !fit;
    setFit(next);
    try { localStorage.setItem("kanban-fit", next ? "1" : "0"); } catch { /* bỏ qua */ }
    // Bật thì đưa khung Kanban ra toàn màn hình, tắt thì thoát
    const el: any = rootRef.current;
    const doc: any = document;
    if (next && el && el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else if (!next && doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen().catch(() => undefined);
  };

  const autoShift = useCurrentShift();
  const shiftIndex = shiftMode === "auto" ? autoShift : +shiftMode;
  const shift = SHIFTS[shiftIndex];
  const st = shiftText(shift);

  /** API lấy danh sách WO-Line; tự mở WO-Line xem lần trước (hoặc WO mới nhất) */
  useEffect(() => {
    if (!authToken) return undefined;
    let alive = true;
    axios.post(
      `${PLANNING_API_URL}/rest/entities/PlanningWorkOrder/search`,
      {
        view: "with-profile-programming",
        sort: "-createTime",
        filter: { conditions: [{ property: "workOrderType", operator: "=", value: "LINE" }] },
        returnCount: true
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    ).then(res => {
      if (!alive) return;
      const raw = Array.isArray(res.data) ? res.data : asArray(res.data?.data);
      const list: string[] = [];
      raw.forEach((w: any) => {
        const id = w?.woId ? String(w.woId) : "";
        if (id && list.indexOf(id) < 0) list.push(id);
      });
      setWoLines(list);
      let saved: string | null = null;
      try { saved = localStorage.getItem("kanban-wo"); } catch { /* bỏ qua */ }
      const first = saved && list.indexOf(saved) >= 0 ? saved : list[0];
      if (first) {
        setWoLine(first);
        setQuery({ woLine: first, dateFrom: productionDate(), dateTo: productionDate() });
      } else {
        setFiltersOpen(true);
      }
    }).catch(err => {
      if (!alive) return;
      toast.error(errMessage(err, tRef.current("msg.unknown")));
      setFiltersOpen(true);
    });
    return () => { alive = false; };
  }, [authToken]);

  /** Tải dữ liệu theo bộ lọc đã tìm kiếm; tự tải lại mỗi 30 giây (lần tự tải lại không hiện lỗi để tránh làm phiền) */
  useEffect(() => {
    if (!query || !authToken) return undefined;
    let alive = true;
    const auth = { headers: { Authorization: `Bearer ${authToken}` } };

    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const resCommon = await axios.get(
          `${PLANNING_API_URL}/services/api/production-report/get-common-info/${encodeURIComponent(query.woLine)}`, auth);
        const result = resCommon.data?.result;
        if (!result || !result.ok) throw new Error(result?.message || tRef.current("msg.unknown"));

        const allDays = listDays(query.dateFrom, query.dateTo, Number.MAX_SAFE_INTEGER);
        const days = allDays.slice(-MAX_DAYS);
        if (!silent && allDays.length > days.length) toast.info(tRef.current("msg.maxDays", { n: MAX_DAYS }));
        const [reports, records] = await Promise.all([
          Promise.all(days.map(d => axios.post(
            `${PLANNING_API_URL}/services/api/production-report/get-daily-report?workOrderCode=${encodeURIComponent(query.woLine)}&date=${d}`,
            {}, auth
          ).then(r => r.data || {}))),
          // Lỗi theo công đoạn / giờ: tải lỗi thì vẫn hiện Kanban, Pareto dùng errorList cả ngày
          fetchDefectRecords(query.woLine, days, auth).catch(() => null)
        ]);

        if (alive) setData(buildKanbanData(query.woLine, resCommon.data.data || {}, reports, records));
      } catch (err) {
        if (alive && !silent) {
          toast.error(errMessage(err, tRef.current("msg.unknown")));
          setData(null);
        }
      } finally {
        if (alive && !silent) setLoading(false);
      }
    };

    load(false);
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [query, reloadKey, authToken]);

  // Tự chuyển ca: khi qua mốc đổi ca, về khung giờ đầy đủ của ca mới. Đang xem một ngày thì chuyển sang
  // ngày sản xuất hiện tại (ca đêm sau 0:00 vẫn thuộc ngày hôm trước); đang xem nhiều ngày thì giữ nguyên.
  const prevAutoShift = useRef(autoShift);
  useEffect(() => {
    if (prevAutoShift.current === autoShift) return;
    prevAutoShift.current = autoShift;
    if (shiftMode !== "auto") return;
    setRange(null);
    setQuery(q => {
      if (!q || q.dateFrom !== q.dateTo) return q;
      const d = productionDate();
      setDates({ from: d, to: d });
      return { ...q, dateFrom: d, dateTo: d };
    });
  }, [autoShift, shiftMode]);

  // WO khác có thể có danh sách công đoạn khác: chỉ đặt lại lựa chọn công đoạn khi danh sách đổi (không đặt lại mỗi lần tự tải)
  const stageKey = data ? data.stages.map(s => s.key).join("|") : "";
  useEffect(() => setStageSel(null), [stageKey]);

  // ---------- Số liệu đang xem ----------
  const stageNamesAll = data ? data.stages.map(s => s.name) : [];
  const slotOptions = shiftSlots(shiftIndex);
  const from = range ? range.from : slotOptions[0];
  const to = range ? range.to : slotOptions[slotOptions.length - 1];
  const selected = useMemo(
    () => (stageSel ? stageSel.filter(i => i < stageNamesAll.length) : stageNamesAll.map((_, i) => i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageSel, stageKey]
  );
  const view = useMemo(() => (data ? computeView(data, shiftIndex, from, to, selected) : null), [data, shiftIndex, from, to, selected]);
  const stageNames = selected.map(i => stageNamesAll[i]);
  const outside = data && data.hasOutside ? selected.map(j => data.outside[j]) : null;

  const errorNames = useErrorNames(authToken);
  const pareto = useMemo(() => buildPareto(toDefectList(data ? data.errorList : [], errorNames)), [data, errorNames]);

  // Defect Distribution: lỗi trong ca / khung giờ / công đoạn đang xem (từ lịch sử test);
  // không tải được lịch sử thì dùng errorList cả ngày
  const normStage = (s: string) => s.trim().toUpperCase();
  const paretoView = useMemo(() => {
    if (!data || !view || !data.defectRecords) return pareto;
    const all = selected.length === stageNamesAll.length;
    const picked = stageNames.map(normStage);
    const counts = new Map<string, number>();
    data.defectRecords.forEach(r => {
      if (view.hrs.indexOf(r.slot) < 0) return;
      if (!all && picked.indexOf(normStage(r.stage)) < 0) return;
      counts.set(r.code, (counts.get(r.code) || 0) + 1);
    });
    return buildPareto(toDefectList(Array.from(counts, ([errorCode, errorCount]) => ({ errorCode, errorCount })), errorNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, selected, errorNames, pareto]);

  // Ô Tổng lỗi theo ca (và khung giờ, công đoạn) đang xem: tổng Fail của ca (= biểu đồ Defect Detail, = cột Fail của bảng)
  const shiftDefects = view ? view.totalFail : 0;

  const topStage = useMemo(() => {
    if (!view || !view.totalFail || !view.failByStage.length) return null;
    const j = view.failByStage.indexOf(Math.max(...view.failByStage));
    return view.failByStage[j] > 0 ? { name: stageNames[j], fail: view.failByStage[j] } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // PM Plan: Model = mã sản phẩm, InputGroup = công đoạn đầu, OutputGroup = VMI (hoặc công đoạn cuối);
  // WO chưa cấu hình công đoạn thì vẫn hiện mã sản phẩm, hai nhóm để "—"
  const outIdx = data ? outputStageIndex(data.stages) : -1;
  const pmPlan = data && data.productCode
    ? [{
      model: data.productCode,
      inputGroup: data.stages.length ? data.stages[0].name : "—",
      outputGroup: outIdx >= 0 ? data.stages[outIdx].name : "—"
    }]
    : [];
  // Sản lượng thực tế ca = tổng Pass tại OutputGroup trong các khung giờ đang xem
  const shiftOutput = data && view && outIdx >= 0 ? sum(view.hrs.map(h => data.rows[h][outIdx][0])) : 0;

  // ---------- PlanOutput: nhập tay theo WO + khoảng ngày + ca, lưu trên máy ----------
  const planKey = data && query ? `planOutput:${data.woCode}:${query.dateFrom}_${query.dateTo}:${shift.key}` : null;
  const [planOutput, setPlanOutput] = useState(0);
  useEffect(() => {
    if (!planKey) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(planKey); } catch { /* trình duyệt chặn localStorage */ }
    setPlanOutput(saved != null ? +saved : 0);
  }, [planKey]);
  const onPlanOutput = (value: number) => {
    setPlanOutput(value);
    if (planKey) {
      try { localStorage.setItem(planKey, String(value)); } catch { /* bỏ qua */ }
    }
  };

  // ---------- Thao tác ----------
  const onShiftMode = (v: string) => { setShiftMode(v); setRange(null); };
  const onRange = (f: number, tt: number) => setRange(f <= tt ? { from: f, to: tt } : { from: tt, to: f });
  // wo: WO vừa chọn trong danh sách (chưa kịp vào state woLine); không truyền thì dùng ô WO-Line
  const onSearch = (picked?: string) => {
    const wo = (picked !== undefined ? picked : woLine).trim();
    if (!wo) {
      toast.error(t("msg.needWo"));
      return;
    }
    try { localStorage.setItem("kanban-wo", wo); } catch { /* bỏ qua */ }
    setQuery({ woLine: wo, dateFrom: dates.from, dateTo: dates.to });
    setReloadKey(k => k + 1);
  };
  const onReset = () => { setShiftMode("auto"); setRange(null); setStageSel(null); };

  // Xuất Excel đúng phần đang xem + ảnh các biểu đồ
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    if (!data || !view || !query) return;
    setExporting(true);
    try {
      const charts = await captureCharts(rootRef.current, [
        { key: "pareto", title: t("xl.paretoChart") },
        { key: "input", title: t("xl.inChart") },
        { key: "output", title: t("xl.outChart") },
        { key: "defect", title: t("xl.defChart") }
      ]);
      await exportKanbanExcel({
        t, locale, st, shiftKey: shift.key, shiftRangeText: shiftRange(shift, t("nextDay")),
        dateRange: { from: query.dateFrom, to: query.dateTo },
        fromLabel: SLOTS[from].split("-")[0], toLabel: SLOTS[to].split("-")[1],
        woCode: data.woCode,
        products: [{ name: data.productName || data.productCode, plan: data.plan, done: data.done }],
        pmPlan, allStages: data.stages.length, stageNames, view, outside, pareto: paretoView,
        totalDefects: shiftDefects, topDefect: paretoView.items[0], paretoScope, topStage,
        planOutput, shiftOutput, charts
      });
    } catch (e) {
      toast.error(t("app.exportErr", { m: errMessage(e, t("msg.unknown")) }));
    } finally {
      setExporting(false);
    }
  };

  const night = shift.key === "night";

  // Dòng phạm vi dưới Defect Distribution: ngày · ca + khung giờ · công đoạn đang xem
  const dateLbl = rangeLabel({ from: query ? query.dateFrom : dates.from, to: query ? query.dateTo : dates.to });
  const stagesLbl = selected.length === stageNamesAll.length ? t("stages.allN", { n: stageNamesAll.length })
    : stageNames.length <= 3 ? stageNames.join(", ") : t("stages.n", { n: stageNames.length });
  const paretoScope = data && data.defectRecords
    ? t("pareto.scopeFiltered", { d: dateLbl, shift: st.shift, from: SLOTS[from].split("-")[0], to: SLOTS[to].split("-")[1], stages: stagesLbl })
    : t("pareto.scope", { d: dateLbl });

  return (
    <div className="wo-dash" ref={rootRef}>
      <FilterBar
        open={filtersOpen} onOpen={setFiltersOpen}
        woLines={woLines} woLine={woLine} onWoLine={setWoLine} dates={dates} onDates={onDates}
        shiftMode={shiftMode} autoShift={autoShift} onShiftMode={onShiftMode}
        slotOptions={slotOptions} from={from} to={to} onRange={onRange}
        stages={stageNamesAll} selectedStages={selected} onStages={setStageSel}
        onSearch={onSearch} onReset={onReset}
        onExport={data && view ? onExport : null} exporting={exporting}
        fit={fit} onToggleFit={onToggleFit}
      />

      <main className={`wd-main${loading ? " is-loading" : ""}`}>
        {!data || !view ? (
          <div className="loading-box">{loading ? t("app.loading") : query ? t("app.noData") : t("app.pickWo")}</div>
        ) : (
          <>
            <KpiCards
              totalDefects={shiftDefects}
              topDefect={paretoView.items[0]} topStage={topStage}
              woCode={data.woCode} plan={data.plan} done={data.done}
            />

            <InfoTables productName={data.productName || data.productCode} pmPlan={pmPlan} shiftText={st}
              planOutput={planOutput} onPlanOutput={onPlanOutput} shiftOutput={shiftOutput} />

            <HourlyOutputPieChart pareto={paretoView} compact={fit}
              note={data.defectRecords ? undefined : t("pareto.noteFilter")} />

            {/* Nhiều công đoạn (> 10): bảng chiếm hết chiều ngang, 3 biểu đồ chuyển xuống thành một hàng bên dưới */}
            <div className={`bottom-row${stageNames.length > 10 ? " wide" : ""}`}>
              <section className="detail-col">
                <HourlyPassOutputChart values={view.input} labels={view.labels} night={night} />
                <HourlyCompleteOutputChart values={view.output} labels={view.labels} night={night} />
                <HourlyFailOutputChart values={view.failByHour} labels={view.labels} night={night} />
              </section>

              <StageTable stageNames={stageNames} rows={view.rows} outside={outside} noStages={!data.stages.length}
                totals={view.totals} />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export const HourlyOutputReport = React.memo(() => (
  <I18nProvider>
    <KanbanScreen />
  </I18nProvider>
));
export default HourlyOutputReport;

const ROUTING_PATH = "/HourlyOutputReport";
registerScreen({
  component: HourlyOutputReport,
  caption: "Báo cáo chi tiết đơn đặt hàng",
  screenId: "screen.HourlyOutputReport",
  menuOptions: {
    pathPattern: ROUTING_PATH,
    menuLink: ROUTING_PATH
  }
});
