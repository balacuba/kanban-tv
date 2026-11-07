import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./HourlyOutputReport.css";
import axios from "axios";
import { toast } from "react-toastify";
import { registerScreen } from "@haulmont/jmix-react-ui";
import { useMainStore } from "@haulmont/jmix-react-core";
import { PLANNING_API_URL } from "../../config";
import logo from "./mkvision-logo.png";
import { HourlyOutputPieChart, toDefectList, useErrorNames } from "./chart/hourlyOutput/HourlyOutputPieChart";
import { buildPareto, DefectDetail, DefectSnPanel, RepairStatus } from "./chart/hourlyOutput/ErrorParetoChart";
import HourlyPassOutputChart from "./chart/hourlyOutput/HourlyPassOutputChart";
import HourlyCompleteOutputChart from "./chart/hourlyOutput/HourlyCompleteOutputChart";
import HourlyFailOutputChart from "./chart/hourlyOutput/HourlyFailOutputChart";
import HourlyYieldChart from "./chart/hourlyOutput/HourlyYieldChart";
import { usePeriodYield, YieldSource } from "./chart/hourlyOutput/yieldPeriods";
import { exportKanbanExcel } from "./chart/hourlyOutput/KanbanExcel";
import {
  ALL_DAY, ALL_SHIFT, HOURS, I18nProvider, LANGS, MAX_DAYS, REFRESH_MS, SHIFTS, shiftOf, SLOTS, SLOT_HOUR,
  addDays, captureCharts, ChartPopup, fmt, listDays, num, pct, productionDate, rangeLabel, shiftRange, shiftSlots, slotOf, sum,
  useClickOutside, useCurrentShift, useFitToScreen, useI18n, ZoomButton
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
 * Tự tải lại mỗi 5 giây (REFRESH_MS) và tự chuyển ca ngày / ca đêm theo giờ máy.
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
  // Từng WO đang gộp (1 WO, hoặc các WO của model khi chọn "Tất cả WO của model")
  products: { wo: string; code: string; name: string; plan: number; done: number; inputGroup: string; outputGroup: string }[];
  // Theo khung giờ, tính riêng từng WO rồi cộng (các WO có thể bắt đầu ở công đoạn khác nhau, vd. AOI-TOP / AOI-BOT):
  inByHour: number[];        // Input = Pass công đoạn đầu của WO (stage0_pass)
  outByHour: number[];       // Pass tại OutputGroup của WO (VMI, không có thì công đoạn cuối)
}
// Một lỗi đã ghi nhận: mã lỗi, công đoạn phát hiện (trạm sửa R_xxx → xxx), khung giờ, số SN, thời gian,
// công đoạn lỗi theo SerialnumberErrorHistory ("" = chưa có), công đoạn SN được trả về sau khi sửa ("" = đang sửa),
// trạng thái: đang sửa / đã sửa (đã trả về công đoạn) / OK (đã sửa và đã qua lại công đoạn được trả về)
interface DefectRecord {
  code: string; stage: string; slot: number; sn: string; time: string; errorStage: string; returnStage: string; errorName: string;
  status: RepairStatus;
  position: string;   // vị trí lỗi trên bản mạch (note lúc bắn lỗi, vd. U6, R72)
}
// woLine = mã WO (nhiều WO cách nhau dấu phẩy), hoặc ALL_WO = tất cả WO của model; wos = các WO cần tải
// sumWos: các WO cộng vào Sản lượng (dự kiến / hoàn thành) và mục Sản phẩm = mọi WO trong bộ lọc, kể cả WO không chạy
// trong các ngày đang xem (wos chỉ gồm WO cần dò số liệu: bỏ WO tạo sau ngày cuối)
interface Query { woLine: string; wos: string[]; sumWos: string[]; model: string; product: string; line: string; dateFrom: string; dateTo: string; }
interface WoInfo { wo: string; model: string; product: string; line: string; created: string; }
// WO thuộc model m và dây chuyền l (rỗng = tất cả)
const matchWo = (x: WoInfo, m: string, l: string, p = "") =>
  (!m || x.model === m) && (!l || x.line === l) && (!p || x.product === p);
const ALL_WO = "__all__";
const SCAN_EVERY = 12;   // "Tất cả WO của model": cứ 12 lần tự tải (~1 phút) dò lại các WO chưa có số liệu
const POOL = 4;          // số yêu cầu gửi cùng lúc khi tải nhiều WO (từ ~6 yêu cầu cùng lúc get-daily-report đã hay trả 502)

// Server thỉnh thoảng trả 502 / 503 / 504: gửi lại tối đa 2 lần (chờ 0,4 rồi 1,2 giây)
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let k = 0; ; k++) {
    try {
      return await fn();
    } catch (err: any) {
      const st = err?.response?.status;
      if (k >= 2 || !(st >= 500)) throw err;
      await new Promise(r => setTimeout(r, k ? 1200 : 400));
    }
  }
}

// Mọi việc chạy qua pool() dùng chung tối đa POOL chỗ (hai nhóm song song mỗi nhóm 6 yêu cầu thì server đã trả 502)
let poolRunning = 0;
const poolWaiting: (() => void)[] = [];
const poolAcquire = () => (poolRunning < POOL
  ? (poolRunning++, Promise.resolve())
  : new Promise<void>(r => { poolWaiting.push(r); }));
const poolRelease = () => {
  const next = poolWaiting.shift();
  if (next) next(); else poolRunning--;
};
// Chạy fn cho từng phần tử, dùng chung giới hạn POOL; kết quả giữ đúng thứ tự
function pool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  return Promise.all(items.map(async x => {
    await poolAcquire();
    try { return await fn(x); } finally { poolRelease(); }
  }));
}

// Lịch sử test có mã lỗi của WO trong các ngày đang xem (ProductSerialNumberTestHistory).
// Chỉ tính bản ghi tại trạm sửa ("R_ICT" → công đoạn "ICT"): mỗi bản ghi là một lỗi đã ghi nhận, cùng cách đếm với
// cột Fail của get-daily-report (stageN_fail = số bản ghi "R_<công đoạn>"). Bản ghi test NG tại chính công đoạn
// (vd. "ICT", testResult = 2) là cùng lỗi đó trước khi sửa, nên không tính để không đếm trùng.
const HISTORY_PAGE = 5000;
// Đọc hết các trang <entity>/search của WO trong khoảng [from, to) theo trường thời gian và điều kiện thêm
async function fetchHistory(wo: string | string[], from: string, to: string, extra: any, auth: any,
  entity = "ProductSerialNumberTestHistory", timeProp = "testTime") {
  const all: any[] = [];
  for (let offset = 0; offset < HISTORY_PAGE * 20; offset += HISTORY_PAGE) {
    const res = await axios.post(`${PLANNING_API_URL}/rest/entities/${entity}/search`, {
      filter: {
        conditions: [
          Array.isArray(wo)
            ? { property: "workOrderCode", operator: "in", value: wo }
            : { property: "workOrderCode", operator: "=", value: wo },
          { property: timeProp, operator: ">=", value: `${from}T00:00:00` },
          { property: timeProp, operator: "<", value: `${to}T00:00:00` }
        ].concat(extra ? [extra] : [])
      },
      sort: timeProp,
      limit: HISTORY_PAGE,
      offset
    }, auth);
    const rows = asArray(res.data);
    rows.forEach(r => all.push(r));
    if (rows.length < HISTORY_PAGE) break;
  }
  return all;
}

// Toàn bộ lịch sử test (mọi công đoạn) của các SN từ ngày from, không giới hạn ngày cuối: SN sửa / test lại sau ca đang xem
async function fetchSnHistory(sns: string[], from: string, auth: any) {
  const all: any[] = [];
  for (let i = 0; i < sns.length; i += 200) {
    for (let offset = 0; offset < HISTORY_PAGE * 20; offset += HISTORY_PAGE) {
      const res = await axios.post(`${PLANNING_API_URL}/rest/entities/ProductSerialNumberTestHistory/search`, {
        filter: {
          conditions: [
            { property: "serialNumber", operator: "in", value: sns.slice(i, i + 200) },
            { property: "testTime", operator: ">=", value: `${from}T00:00:00` }
          ]
        },
        sort: "testTime",
        limit: HISTORY_PAGE,
        offset
      }, auth);
      const rows = asArray(res.data);
      rows.forEach(r => all.push(r));
      if (rows.length < HISTORY_PAGE) break;
    }
  }
  return all;
}

// Các WO có bản ghi test trong [from, to): mỗi lần hỏi lấy 1 bản ghi của các WO còn lại rồi bỏ WO đó ra — số lần hỏi =
// số WO có chạy + 1 (vd. 31 WO × 7 ngày: 6 lần thay vì 217 lần get-daily-report). Kết quả giữ thứ tự của wos.
async function findActiveWos(wos: string[], from: string, to: string, auth: any): Promise<string[]> {
  let left = wos.slice();
  const found: string[] = [];
  while (left.length) {
    const res = await axios.post(`${PLANNING_API_URL}/rest/entities/ProductSerialNumberTestHistory/search`, {
      filter: {
        conditions: [
          { property: "workOrderCode", operator: "in", value: left },
          { property: "testTime", operator: ">=", value: `${from}T00:00:00` },
          { property: "testTime", operator: "<", value: `${to}T00:00:00` }
        ]
      },
      limit: 1
    }, auth);
    const row = asArray(res.data)[0];
    const wo = row ? String(row.workOrderCode || "") : "";
    if (!wo || left.indexOf(wo) < 0) break;
    found.push(wo);
    left = left.filter(x => x !== wo);
  }
  return wos.filter(wo => found.indexOf(wo) >= 0);
}

// Ngày test đầu và cuối của một WO trong [from, to) (2 lần hỏi, mỗi lần 1 bản ghi): chỉ tải get-daily-report các ngày
// WO có chạy thay vì cả khoảng ngày. null = không có bản ghi.
async function testSpan(wo: string, from: string, to: string, auth: any): Promise<[string, string] | null> {
  const one = (sort: string) => axios.post(`${PLANNING_API_URL}/rest/entities/ProductSerialNumberTestHistory/search`, {
    filter: {
      conditions: [
        { property: "workOrderCode", operator: "=", value: wo },
        { property: "testTime", operator: ">=", value: `${from}T00:00:00` },
        { property: "testTime", operator: "<", value: `${to}T00:00:00` }
      ]
    },
    sort,
    limit: 1
  }, auth).then(res => String((asArray(res.data)[0] || {}).testTime || "").slice(0, 10));
  const [a, b] = await Promise.all([one("testTime"), one("-testTime")]);
  return a && b ? [a, b] : null;
}

async function fetchDefectRecords(wo: string | string[], days: string[], auth: any): Promise<DefectRecord[]> {
  const from = days[0], to = addDays(days[days.length - 1], 1);
  // Lỗi: bản ghi có mã lỗi tại trạm sửa. Đã sửa: bản ghi kế tiếp của cùng SN có preStageName = trạm sửa
  // (vd. R_OQC → VMI, repairTime = lúc sửa xong). OK: sau lúc sửa xong, SN qua lại công đoạn đó (bản ghi có
  // preStageName = công đoạn được trả về, testResult = 1). Lịch sử sau lỗi lấy theo danh sách SN lỗi.
  // Công đoạn lỗi: SerialnumberErrorHistory lưu riêng từng lần ghi lỗi (SN, công đoạn, mã lỗi) và không bị xoá khi
  // bắt repair (lịch sử test của SN có thể bị xoá); bảng này có dữ liệu từ 02/11/2026.
  const [errors, logged] = await Promise.all([
    fetchHistory(wo, from, to, { property: "errorCode", operator: "notEmpty" }, auth),
    fetchHistory(wo, addDays(from, -1), addDays(to, 1), null, auth, "SerialnumberErrorHistory", "createdAt")
      .catch(() => [] as any[])
  ]);
  const errorLog = new Map<string, { time: number; stage: string; name: string; note: string }[]>();   // "SN|mã lỗi" → các lần ghi lỗi
  logged.forEach(r => {
    const key = `${String(r.serialNumber || "").trim()}|${String(r.errorCode || "").trim()}`;
    const list = errorLog.get(key) || [];
    list.push({ time: Date.parse(String(r.createdAt || "")), stage: String(r.stageName || "").trim(), name: String(r.errorName || "").trim(), note: String(r.note || "").trim() });
    errorLog.set(key, list);
  });
  // Lần ghi lỗi gần thời điểm bản ghi trạm sửa nhất (cùng lúc hoặc lệch vài phút)
  const loggedError = (sn: string, code: string, time: string) => {
    const t = Date.parse(time);
    let best = { stage: "", name: "", note: "" }, gap = 10 * 60 * 1000;
    (errorLog.get(`${sn}|${code}`) || []).forEach(e => {
      const d = Math.abs(e.time - t);
      if (d <= gap) { gap = d; best = e; }
    });
    return best;
  };
  const snOf = (r: any) => String(r.serialNumber || "").trim();
  const repairErrors = errors.filter(r => /^R_/.test(String(r.stageName || "").trim()));
  const sns = Array.from(new Set(repairErrors.map(snOf).filter(Boolean)));
  const history = await fetchSnHistory(sns, from, auth).catch(() => [] as any[]);
  const bySn = new Map<string, any[]>();   // SN → lịch sử theo thời gian
  history.forEach(r => {
    const list = bySn.get(snOf(r)) || [];
    list.push(r);
    bySn.set(snOf(r), list);
  });
  const timeOf = (r: any) => String(r.testTime || "");
  // Sau lỗi lúc time tại trạm sửa: bản ghi sửa xong (trả về công đoạn) và đã qua lại công đoạn đó chưa
  const repairOf = (sn: string, station: string, time: string) => {
    const list = bySn.get(sn) || [];
    const back = list.filter(x => String(x.preStageName || "").trim() === station && timeOf(x) >= time)[0];
    if (!back) return { returnStage: "", status: "repairing" as RepairStatus };
    const returnStage = String(back.stageName || "").trim();
    const doneAt = Date.parse(String(back.repairTime || back.testTime || ""));
    const passed = list.some(x => String(x.preStageName || "").trim() === returnStage && Number(x.testResult) === 1
      && Date.parse(timeOf(x)) > doneAt);
    return { returnStage, status: (passed ? "ok" : "repaired") as RepairStatus };
  };
  const out: DefectRecord[] = [];
  repairErrors.forEach(r => {
    const stageName = String(r.stageName || "").trim();
    const time = String(r.testTime || "");
    const hour = Number(time.slice(11, 13));
    const stage = stageName.replace(/^R_/, "");
    const sn = String(r.serialNumber || r.qaNumber || "").trim();
    const { returnStage, status } = repairOf(snOf(r), stageName, time);
    String(r.errorCode || "").split(/[,;]/).map(s => s.trim()).filter(Boolean)
      .forEach(code => {
        const log = loggedError(String(r.serialNumber || "").trim(), code, time);
        out.push({ code, stage, slot: SLOT_HOUR.indexOf(hour), sn, time, returnStage, status, errorStage: log.stage, errorName: log.name,
          position: log.note || String(r.note || "").trim() });
      });
  });
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

  const out = stages.length ? outputStageIndex(stages) : -1;
  const product = {
    wo: woCode, code: String(common.productCode ?? ""), name: String(common.productName ?? ""),
    plan: num(common.expectedQuantity), done: num(common.completedQuantity),
    inputGroup: stages.length ? stages[0].name : "—", outputGroup: out >= 0 ? stages[out].name : "—"
  };
  return {
    woCode,
    productName: product.name,
    productCode: product.code,
    plan: product.plan,
    done: product.done,
    stages, rows, outside, hasOutside, outputByHour, failByHour, hasFailTable,
    errorList: Array.from(errors, ([errorCode, errorCount]) => ({ errorCode, errorCount })),
    defectRecords,
    products: [product],
    inByHour: rows.map(r => (stages.length ? r[0][0] : 0)),
    outByHour: rows.map(r => (out >= 0 ? r[out][0] : 0))
  };
}

// get-daily-report của một WO có số liệu không (Pass / Fail / hoàn thành / lỗi khác 0)
function hasData(reports: any[]) {
  return reports.some(rep =>
    asArray(rep.detailTable).some((r: any) => Object.keys(r).some(k => /_(pass|fail)$/.test(k) && num(r[k]) > 0)) ||
    asArray(rep.completeQuantity).some((r: any) => num(r.completeQuantity) > 0) ||
    asArray(rep.errorList).some((e: any) => num(e?.errorCount) > 0));
}

// Gộp nhiều WO (tất cả WO của model) thành một: công đoạn gộp theo tên (thứ tự xuất hiện), các số cộng lại
const stageId = (s: string) => s.trim().toUpperCase();
// idle: sản phẩm của các WO trong bộ lọc không có số liệu trong các ngày đang xem — chỉ cộng vào Sản lượng / Sản phẩm
function mergeKanban(woCode: string, parts: KanbanData[], defectRecords: DefectRecord[] | null,
  idle: KanbanData["products"] = []): KanbanData {
  const stages: Stage[] = [];
  const idx = new Map<string, number>();
  parts.forEach(p => p.stages.forEach(s => {
    const k = stageId(s.name);
    if (!idx.has(k)) { idx.set(k, stages.length); stages.push({ name: s.name, key: k }); }
  }));
  const rows = SLOTS.map(() => stages.map(() => [0, 0]));
  const outside = stages.map(() => [0, 0]);
  const outputByHour = zeros(SLOTS.length), failByHour = zeros(SLOTS.length);
  const errors = new Map<string, number>();
  const inByHour = zeros(SLOTS.length), outByHour = zeros(SLOTS.length);
  const add = (a: number[], b: number[]) => { a[0] += b[0]; a[1] += b[1]; };
  const uniq = (list: string[]) => list.filter((x, i) => x && list.indexOf(x) === i);
  parts.forEach(p => {
    const map = p.stages.map(s => idx.get(stageId(s.name)) as number);
    p.rows.forEach((r, h) => r.forEach((c, j) => add(rows[h][map[j]], c)));
    p.outside.forEach((c, j) => add(outside[map[j]], c));
    p.outputByHour.forEach((v, h) => { outputByHour[h] += v; });
    p.failByHour.forEach((v, h) => { failByHour[h] += v; });
    p.errorList.forEach(e => errors.set(e.errorCode, (errors.get(e.errorCode) || 0) + e.errorCount));
    p.inByHour.forEach((v, h) => { inByHour[h] += v; });
    p.outByHour.forEach((v, h) => { outByHour[h] += v; });
  });
  const products = ([] as KanbanData["products"]).concat(...parts.map(p => p.products), idle);
  return {
    woCode,
    productName: uniq(products.map(p => p.name)).join(" / "),
    productCode: uniq(products.map(p => p.code)).join(", "),
    plan: sum(products.map(p => p.plan)),
    done: sum(products.map(p => p.done)),
    stages, rows, outside, hasOutside: parts.some(p => p.hasOutside), outputByHour, failByHour,
    hasFailTable: parts.length > 0 && parts.every(p => p.hasFailTable),
    errorList: Array.from(errors, ([errorCode, errorCount]) => ({ errorCode, errorCount })),
    defectRecords, products, inByHour, outByHour
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
    input: hrs.map(h => d.inByHour[h]),   // Input = Pass công đoạn đầu (stage0_pass), cộng từng WO
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

// Ô chọn WO-Line (chọn được nhiều WO): bấm vào là xổ toàn bộ danh sách, gõ để lọc.
// - Bấm vào mã WO: chỉ xem WO đó, tải ngay (như cũ).
// - Bấm ô vuông (hoặc phím Space): thêm / bỏ WO khỏi lựa chọn; đóng danh sách thì tải các WO đã chọn (gộp số liệu).
// - "Tất cả WO" (khi đã chọn model): tất cả WO của model trên dây chuyền đang chọn.
// Phím ↑ ↓ để di chuyển, Enter để chỉ xem dòng đang chọn (hoặc mã đang gõ), Esc để đóng.
// Giá trị: một mã WO, nhiều mã cách nhau bằng dấu phẩy, hoặc ALL_WO.
const WO_MENU_MAX = 300; // số dòng hiện tối đa trong danh sách (gõ thêm để lọc)
const parseWos = (v: string) => v.split(",").map(s => s.trim()).filter((s, i, a) => s && a.indexOf(s) === i);

function WoCombo({ items, value, onChange, onPick, placeholder, allLabel, multiLabel }: {
  items: string[];
  allLabel?: string;   // có model: dòng đầu = tất cả WO của model (giá trị ALL_WO)
  multiLabel: (n: number) => string;
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
  const valueRef = useRef(value);
  valueRef.current = value;
  const openedWith = useRef(value);         // giá trị lúc mở danh sách: đóng mà đã đổi thì tải lại
  const openRef = useRef(open);
  openRef.current = open;
  const close = useCallback(() => {
    if (!openRef.current) return;
    setOpen(false);
    setQuery("");
    if (valueRef.current !== openedWith.current && valueRef.current) onPick(valueRef.current);
  }, [onPick]);
  useClickOutside(ref, close);

  const isAll = value === ALL_WO;
  const sel = isAll ? items : parseWos(value);
  const opts = allLabel ? [ALL_WO].concat(items) : items;
  const text = (w: string) => (w === ALL_WO ? allLabel || "" : w);
  const summary = isAll ? allLabel || "" : sel.length > 1 ? `${multiLabel(sel.length)}: ${sel.join(", ")}` : sel[0] || "";
  const q = query.trim().toLowerCase();
  const list = (q ? opts.filter(w => text(w).toLowerCase().indexOf(q) >= 0) : opts).slice(0, WO_MENU_MAX);
  const checked = (w: string) => (w === ALL_WO ? isAll : isAll || sel.indexOf(w) >= 0);

  const show = () => {
    setQuery("");
    setHi(Math.max(0, opts.indexOf(isAll ? ALL_WO : sel[0] || "")));
    openedWith.current = value;
    setOpen(true);
  };
  // Chỉ xem một dòng: tải ngay
  const pick = (w: string) => {
    onChange(w);
    openedWith.current = w;
    setOpen(false);
    setQuery("");
    onPick(w);
  };
  // Thêm / bỏ một dòng khỏi lựa chọn (chưa tải; đóng danh sách mới tải)
  const toggle = (w: string) => {
    if (w === ALL_WO) { onChange(isAll ? "" : ALL_WO); return; }
    const next = checked(w) ? sel.filter(x => x !== w) : sel.concat([w]);
    onChange(allLabel && items.length > 1 && items.every(x => next.indexOf(x) >= 0) ? ALL_WO : next.join(","));
  };

  // Giữ dòng đang chọn luôn nhìn thấy trong danh sách
  useEffect(() => {
    const el = listRef.current && (listRef.current.children[hi] as HTMLElement | undefined);
    if (open && el) el.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  return (
    <div className="wo-combo" ref={ref}>
      <input
        id="wd-wo" className="wo-input" autoComplete="off" value={open ? query : summary}
        placeholder={open ? summary || placeholder : placeholder} title={summary}
        role="combobox" aria-expanded={open} aria-controls="wd-wo-menu"
        onFocus={() => { if (!open) show(); }}
        onClick={() => { if (!open) show(); }}
        onChange={e => { setQuery(e.target.value); setHi(0); if (!open) { openedWith.current = value; setOpen(true); } }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) show(); else setHi(i => Math.min(list.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(0, i - 1)); }
          else if (e.key === " " && open && list[hi] && !query) { e.preventDefault(); toggle(list[hi]); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (open && list[hi]) pick(list[hi]);
            else if (query.trim()) pick(query.trim());   // mã gõ tay không có trong danh sách
            else close();
          }
          else if (e.key === "Escape" || e.key === "Tab") close();
        }}
      />
      <button type="button" className={`wo-combo-btn${open ? " open" : ""}`} tabIndex={-1} aria-label="WO-Line"
        onClick={() => (open ? close() : show())} />
      {open && (
        <ul className="wo-menu" id="wd-wo-menu" role="listbox" aria-multiselectable="true" ref={listRef}>
          {list.length ? list.map((w, i) => (
            <li key={w} role="option" aria-selected={checked(w)}
              className={`${i === hi ? "hi" : ""}${checked(w) ? " sel" : ""}${w === ALL_WO ? " all" : ""}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={e => { e.preventDefault(); pick(w); }}>
              <span className={`wo-check${checked(w) ? " on" : ""}`} role="checkbox" aria-checked={checked(w)}
                aria-label={text(w)}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); toggle(w); }} />
              {text(w)}
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
  lines: { name: string; count: number }[];
  line: string;
  onLine: (v: string) => void;
  products: { name: string; count: number }[];
  product: string;
  onProduct: (v: string) => void;
  models: { name: string; count: number }[];
  model: string;
  onModel: (v: string) => void;
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
          {/* Model → Tên sản phẩm → Dây chuyền → WO-Line */}
          <div className="field">
            <label htmlFor="wd-model">{t("f.model")}</label>
            {/* Model = trường note của WO (vd. BAM2510, M6); chọn model thì ô WO-Line chỉ còn WO của model đó */}
            <select id="wd-model" className="model-sel" value={p.model} onChange={e => p.onModel(e.target.value)}>
              <option value="">{t("f.modelAll")}</option>
              {p.models.map(m => <option key={m.name} value={m.name}>{m.name} ({m.count})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wd-product">{t("f.product")}</label>
            {/* Tên sản phẩm = productName của WO; chỉ hiện sản phẩm có WO của model đang chọn */}
            <select id="wd-product" className="product-sel" value={p.product} onChange={e => p.onProduct(e.target.value)}
              title={p.product}>
              <option value="">{t("f.productAll")}</option>
              {p.products.map(m => <option key={m.name} value={m.name}>{m.name} ({m.count})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wd-line">{t("f.line")}</label>
            {/* Dây chuyền = trường line của WO (trống thì lấy groupCode), vd. SMT, ASSY, PACKING; chỉ hiện dây chuyền có WO của model */}
            <select id="wd-line" className="model-sel" value={p.line} onChange={e => p.onLine(e.target.value)}>
              <option value="">{t("f.lineAll")}</option>
              {p.lines.map(m => <option key={m.name} value={m.name}>{m.name} ({m.count})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wd-wo">{t("f.wo")}</label>
            <WoCombo items={p.woLines} value={p.woLine} onChange={p.onWoLine} onPick={w => p.onSearch(w)}
              placeholder={t("f.woPlaceholder")}
              allLabel={p.model || p.product ? t("f.woAll") : undefined} multiLabel={n => t("f.woN", { n })} />
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
              <option value={String(ALL_SHIFT)}>{t("shift.all")} ({shiftRange(ALL_DAY, t("nextDay"))})</option>
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

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="hero-stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
    {sub && <span className="sub">{sub}</span>}
  </div>
);

function KpiCards({ totalDefects, input, defectSns, topDefect, topStage, woCode, plan, done }: {
  totalDefects: number;
  input: number;              // Input (Pass công đoạn đầu) trong ca / khung giờ đang xem
  defectSns: number | null;   // số SN lỗi (không tải được lịch sử test thì null → hiện tổng Fail)
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
        {/* Tổng lỗi = số SN lỗi (1 SN lỗi nhiều lần / nhiều công đoạn chỉ đếm 1); không tải được lịch sử test thì = tổng Fail */}
        <Stat label={t("kpi.total")} value={fmt(defectSns === null ? totalDefects : defectSns)} />
        <span className="hero-divider" />
        {/* Tỷ lệ lỗi = tổng số lỗi các công đoạn (tổng Fail) / Input (Pass công đoạn đầu), cùng ca / khung giờ / công đoạn đang xem */}
        <Stat label={t("kpi.rate")} value={input ? pct(totalDefects, input, 2) : "—"}
          sub={t("kpi.rateSub", { n: fmt(totalDefects), i: fmt(input) })} />
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
// onPick: bấm ô có Fail để xem SN lỗi (không truyền thì ô chỉ để xem)
const Cells = ({ cells, onPick }: { cells: number[][]; onPick?: (j: number) => void }) => (
  <>
    {cells.map((c, j) => {
      const pick = onPick && c[1] > 0 ? () => onPick(j) : undefined;
      return (
        <td key={j} className={`pf${c[1] > 0 ? " hit" : ""}${pick ? " pick" : ""}`} title={`Pass ${fmt(c[0])} · Fail ${c[1]}`}
          role={pick ? "button" : undefined} tabIndex={pick ? 0 : undefined} onClick={pick}
          onKeyDown={pick ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } } : undefined}>
          <span className="pf-one">
            <span className="pv">{fmt(c[0])}</span>
            <span className="sep">/</span>
            <span className="fv">{c[1]}</span>
          </span>
        </td>
      );
    })}
  </>
);

function StageTable({ stageNames, rows, outside, noStages, totals, onPick }: {
  stageNames: string[];
  rows: { slot: string; cells: number[][] }[];
  outside: number[][] | null;
  noStages: boolean;   // WO-Line chưa cấu hình công đoạn nào (khác với người dùng bỏ chọn hết)
  totals: number[][];  // [Pass, Fail] từng công đoạn trong ca / khung giờ đang xem (= dòng Tổng)
  onPick?: (stage: number, row: number) => void;   // bấm ô Fail: row = chỉ số dòng, -1 = dòng Tổng
}) {
  const { t } = useI18n();
  // Phần pass và phần fail rộng bằng nhau (theo số dài nhất cả bảng): đầu số thẳng cột, dấu "/" nằm chính giữa ô
  const all = rows.reduce((acc: number[][], r) => acc.concat(r.cells), []).concat(outside || [], totals);
  const nw = Math.max(1, ...all.map(c => Math.max(fmt(c[0]).length, String(c[1]).length)));
  const width = { ["--nw" as any]: `${nw}ch` } as React.CSSProperties;
  const [big, setBig] = useState(false);   // phóng to thành popup
  const head = (pop: boolean) => (
    <h2 className="card-title center defect-title blue">
      <span className="defect-title-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></svg>
      </span>
      {t("stage.title")}
      <ZoomButton open={pop} onClick={() => setBig(!pop)} />
    </h2>
  );
  // Trong popup: bấm ô Fail thì thu nhỏ popup rồi mở bảng SN (bảng SN nằm dưới bảng công đoạn)
  const table = (pop: boolean) => {
    const pick = onPick && (pop ? (j: number, k: number) => { setBig(false); onPick(j, k); } : onPick);
    return (
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
                {rows.map(({ slot, cells }, k) => (
                  <tr key={slot} className={cells.every(c => !c[0] && !c[1]) ? "idle" : undefined}>
                    <td className="time">{slot}</td>
                    <Cells cells={cells} onPick={pick && (j => pick(j, k))} />
                  </tr>
                ))}
                {/* Dòng Tổng: tổng Pass / Fail từng công đoạn trong các khung giờ đang xem */}
                <tr className="total">
                  <td className="time">{t("xl.total")}</td>
                  <Cells cells={totals} onPick={pick && (j => pick(j, -1))} />
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
    );
  };
  return (
    <>
      <section className="card stage-card">
        {head(false)}
        <div className="card-body stage-scroll">{table(false)}</div>
      </section>
      {big && (
        <ChartPopup className="stage-card stage-pop" header={head(true)} onClose={() => setBig(false)}>
          <div className="stage-scroll stage-pop-scroll">{table(true)}</div>
        </ChartPopup>
      )}
    </>
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
  const [woAll, setWoAll] = useState<WoInfo[]>([]);   // mọi WO-Line + model (note của WO) + dây chuyền
  const [product, setProduct] = useState(() => {
    try { return localStorage.getItem("kanban-product") || ""; } catch { return ""; }
  });
  const [line, setLine] = useState(() => {
    try { return localStorage.getItem("kanban-line") || ""; } catch { return ""; }
  });
  const [model, setModel] = useState(() => {
    try { return localStorage.getItem("kanban-model") || ""; } catch { return ""; }
  });
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
  const shift = shiftOf(shiftIndex);
  const st = shiftText(shift);

  /** API lấy danh sách WO-Line; tự mở WO-Line xem lần trước (hoặc WO mới nhất) */
  useEffect(() => {
    if (!authToken) return undefined;
    let alive = true;
    // Server thỉnh thoảng trả 502: gửi lại (withRetry) để màn không bị trống
    withRetry(() => axios.post(
      `${PLANNING_API_URL}/rest/entities/PlanningWorkOrder/search`,
      {
        view: "with-profile-programming",
        sort: "-createTime",
        filter: { conditions: [{ property: "workOrderType", operator: "=", value: "LINE" }] },
        returnCount: true
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    )).then((res: any) => {
      if (!alive) return;
      const raw = Array.isArray(res.data) ? res.data : asArray(res.data?.data);
      const all: WoInfo[] = [];
      raw.forEach((w: any) => {
        const id = w?.woId ? String(w.woId) : "";
        if (id && !all.some(x => x.wo === id)) all.push({
          wo: id, model: String(w.note || "").trim(),
          product: String(w.productName || "").trim(),
          line: String(w.line || w.groupCode || "").trim(),   // line trống ở nhiều WO: lấy groupCode
          created: String(w.createTime || "").slice(0, 10)
        });
      });
      setWoAll(all);
      // Model đã lưu không còn WO nào thì bỏ lọc model
      let m = "";
      try { m = localStorage.getItem("kanban-model") || ""; } catch { /* bỏ qua */ }
      let l = "";
      try { l = localStorage.getItem("kanban-line") || ""; } catch { /* bỏ qua */ }
      if (l && !all.some(x => x.line === l)) { l = ""; setLine(""); }
      if (m && !all.some(x => x.model === m)) { m = ""; setModel(""); }
      let p = "";
      try { p = localStorage.getItem("kanban-product") || ""; } catch { /* bỏ qua */ }
      if (p && !all.some(x => matchWo(x, m, "", p))) { p = ""; setProduct(""); }
      if (l && !all.some(x => matchWo(x, m, l, p))) { l = ""; setLine(""); }
      const list = all.filter(x => matchWo(x, m, l, p)).map(x => x.wo);
      let saved: string | null = null;
      try { saved = localStorage.getItem("kanban-wo"); } catch { /* bỏ qua */ }
      if ((m || p) && saved === ALL_WO && list.length) {
        setWoLine(ALL_WO);
        setQuery({ woLine: ALL_WO, wos: list, sumWos: list, model: m, product: p, line: l, dateFrom: productionDate(), dateTo: productionDate() });
        return;
      }
      const keep = saved ? parseWos(saved).filter(w => list.indexOf(w) >= 0) : [];
      const first = keep.length ? keep.join(",") : list[0];
      if (first) {
        setWoLine(first);
        setQuery({ woLine: first, wos: parseWos(first), sumWos: parseWos(first), model: m, product: p, line: l, dateFrom: productionDate(), dateTo: productionDate() });
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

  // Giữ lại giữa các lần tìm kiếm: get-daily-report của ngày cũ ("WO|ngày") và get-common-info (kèm lúc tải)
  const reportCache = useRef(new Map<string, any>());
  const commonCache = useRef(new Map<string, { at: number; v: any }>());

  /** Tải dữ liệu theo bộ lọc đã tìm kiếm; tự tải lại mỗi REFRESH_MS (lần tự tải lại không hiện lỗi để tránh làm phiền).
   *  Lần trước chưa xong thì bỏ qua lượt này. Tab / app bị ẩn vẫn tải bình thường; hiện lại thì tải ngay
   *  (trình duyệt có thể giãn hẹn giờ của tab ẩn). */
  useEffect(() => {
    if (!query || !authToken) return undefined;
    let alive = true;
    const auth = { headers: { Authorization: `Bearer ${authToken}` } };

    let busy = false;
    let active: string[] | null = null;   // nhiều WO: các WO có số liệu trong các ngày đang xem (lần dò gần nhất)
    let tick = 0;
    const spans = new Map<string, [string, string] | null>();   // WO → ngày test đầu / cuối trong khoảng ngày đang xem
    const load = async (silent: boolean) => {
      if (busy) return;
      busy = true;
      if (!silent) setLoading(true);
      try {
        const allDays = listDays(query.dateFrom, query.dateTo, Number.MAX_SAFE_INTEGER);
        const days = allDays.slice(-MAX_DAYS);
        if (!silent && allDays.length > days.length) toast.info(tRef.current("msg.maxDays", { n: MAX_DAYS }));
        // Số liệu ngày cũ (trước hôm qua) gần như không đổi: giữ lại giữa các lần tải / tìm kiếm, chỉ tải lại ở lần dò
        // (~1 phút, SCAN_EVERY lần tự tải). get-common-info giữ tối đa 1 phút với WO không chạy, WO đang chạy tải mỗi lần.
        const recent = addDays(productionDate(), -1);
        const scanTick = ++tick % SCAN_EVERY === 0;
        const stale = () => Promise.reject(new Error("stale"));   // đã tìm kiếm khác: bỏ yêu cầu còn xếp hàng
        const fetchReport = (wo: string, d: string) => {
          if (!alive) return stale();
          const key = `${wo}|${d}`;
          const rc = reportCache.current;
          if (!scanTick && d < recent && rc.has(key)) return Promise.resolve(rc.get(key));
          return withRetry(() => axios.post(
            `${PLANNING_API_URL}/services/api/production-report/get-daily-report?workOrderCode=${encodeURIComponent(wo)}&date=${d}`,
            {}, auth
          )).then(r => {
            const v = r.data || {};
            if (d < recent) rc.set(key, v);
            return v;
          });
        };
        const commonOf = (wo: string, maxAge: number) => {
          const c = commonCache.current.get(wo);
          if (c && Date.now() - c.at < maxAge) return Promise.resolve(c.v);
          if (!alive) return stale();
          return withRetry(() => axios.get(
            `${PLANNING_API_URL}/services/api/production-report/get-common-info/${encodeURIComponent(wo)}`, auth
          )).then(res => {
            const result = res.data?.result;
            if (!result || !result.ok) throw new Error(result?.message || tRef.current("msg.unknown"));
            const v = res.data.data || {};
            commonCache.current.set(wo, { at: Date.now(), v });
            return v;
          }, err => {
            if (c) return c.v;   // server thỉnh thoảng trả 502: dùng lại số lần trước
            throw err;
          });
        };

        let next: KanbanData;
        if (query.woLine !== ALL_WO && query.wos.length === 1) {
          const wo = query.wos[0];
          // Khoảng ngày dài (> 7 ngày): chỉ tải các ngày WO có chạy (± 1 ngày) và các ngày từ hôm qua
          let dl = days;
          if (days.length > 7) {
            if (!spans.has(wo)) {
              await testSpan(wo, days[0], addDays(days[days.length - 1], 1), auth).then(sp => { spans.set(wo, sp); }, () => undefined);
            }
            if (spans.has(wo)) {
              const sp = spans.get(wo);
              dl = days.filter(d => d >= recent || (!!sp && d >= addDays(sp[0], -1) && d <= addDays(sp[1], 1)));
            }
          }
          const [c, reports, records] = await Promise.all([
            commonOf(wo, 0), pool(dl, d => fetchReport(wo, d)),
            // Lỗi theo công đoạn / giờ: tải lỗi thì vẫn hiện Kanban, Pareto dùng errorList cả ngày
            fetchDefectRecords(wo, days, auth).catch(() => null)
          ]);
          next = buildKanbanData(wo, c, reports, records);
        } else {
          // Nhiều WO: chỉ gộp các WO có số liệu trong các ngày đang xem, tối đa POOL yêu cầu cùng lúc.
          // Lần tải đầu dò mọi WO; sau đó ở lần dò (~1 phút) dò lại các WO chưa có số liệu với các ngày từ hôm qua.
          const reportsOf = (wos: string[], ds: string[]) => pool(
            ([] as [string, string][]).concat(...wos.map(wo => ds.map(d => [wo, d] as [string, string]))),
            ([wo, d]) => fetchReport(wo, d).catch(() => null)
          ).then(flat => wos.map((_, i) => flat.slice(i * ds.length, (i + 1) * ds.length)));
          // get-common-info của mọi WO trong bộ lọc (cho Sản lượng hoàn thành) tải song song với việc dò số liệu
          const wasActive = active;
          const commonsP = pool(query.sumWos, wo =>
            commonOf(wo, wasActive && wasActive.indexOf(wo) >= 0 ? 0 : 60000).catch(() => null));
          // Dò WO có chạy bằng lịch sử test (nhanh); lỗi thì dò bằng get-daily-report từng WO × từng ngày (chậm)
          const got = new Map<string, any[]>();
          const probeWos = async (wos: string[], ds: string[]) => {
            try {
              return await findActiveWos(wos, ds[0], addDays(ds[ds.length - 1], 1), auth);
            } catch {
              const probe = await reportsOf(wos, ds);
              return wos.filter((wo, i) => {
                const reps = probe[i].filter(Boolean);
                if (!hasData(reps)) return false;
                if (ds.length === days.length) got.set(wo, reps);
                return true;
              });
            }
          };
          if (!active) {
            active = await probeWos(query.wos, days);
          } else if (scanTick) {
            const near = days.filter(d => d >= recent);
            const idle = query.wos.filter(wo => active!.indexOf(wo) < 0);
            if (near.length && idle.length) {
              const more = await probeWos(idle, near);
              active = query.wos.filter(wo => active!.indexOf(wo) >= 0 || more.indexOf(wo) >= 0);
            }
          }
          const live = active;
          const need = live.filter(wo => !got.has(wo));
          // Mỗi WO chỉ tải các ngày nó có chạy (± 1 ngày, vì ca đêm sau 0:00 thuộc ngày trước) và các ngày từ hôm qua
          await pool(need.filter(wo => !spans.has(wo)), wo => testSpan(wo, days[0], addDays(days[days.length - 1], 1), auth)
            .then(sp => { spans.set(wo, sp); }, () => { spans.set(wo, null); }));
          const daysFor = (wo: string) => {
            const sp = spans.get(wo);
            return sp ? days.filter(d => d >= recent || (d >= addDays(sp[0], -1) && d <= addDays(sp[1], 1))) : days;
          };
          const pairs = ([] as [string, string][]).concat(...need.map(wo => daysFor(wo).map(d => [wo, d] as [string, string])));
          const [fresh, records, commonList] = await Promise.all([
            pool(pairs, ([wo, d]) => fetchReport(wo, d).catch(() => null)),
            live.length ? fetchDefectRecords(live, days, auth).catch(() => null) : Promise.resolve([] as DefectRecord[]),
            commonsP
          ]);
          need.forEach(wo => got.set(wo, []));
          pairs.forEach(([wo], i) => { if (fresh[i]) (got.get(wo) as any[]).push(fresh[i]); });
          const commons = new Map<string, any>();
          query.sumWos.forEach((wo, i) => { if (commonList[i]) commons.set(wo, commonList[i]); });
          // WO đang chạy nhưng không nằm trong sumWos (không xảy ra với bộ lọc hiện tại) thì tải riêng
          await pool(live.filter(wo => !commons.has(wo)),
            wo => commonOf(wo, 0).then(c => { commons.set(wo, c); }, () => undefined));
          const parts: KanbanData[] = [];
          live.forEach(wo => {
            if (commons.has(wo)) parts.push(buildKanbanData(wo, commons.get(wo), got.get(wo) || [], null));
          });
          // Sản lượng hoàn thành = tổng mọi WO trong bộ lọc: WO không chạy trong các ngày đang xem chỉ cộng sản lượng
          const idle = query.sumWos.filter(wo => live.indexOf(wo) < 0 && commons.has(wo))
            .map(wo => buildKanbanData(wo, commons.get(wo), [], null).products[0]);
          // Nhãn ô Mã WO-Line: tất cả WO → "BAM2510 · SMT · 2/5 WO" (số WO có chạy / số WO trong bộ lọc); tự chọn nhiều WO → số WO đã chọn
          next = mergeKanban(query.woLine === ALL_WO
            ? `${query.model || query.product}${query.line ? ` · ${query.line}` : ""} · ${parts.length}/${query.sumWos.length} WO`
            : `${query.wos.length} WO`, parts, records, idle);
        }

        if (alive) setData(next);
      } catch (err) {
        if (alive && !silent) {
          toast.error(errMessage(err, tRef.current("msg.unknown")));
          setData(null);
        }
      } finally {
        busy = false;
        if (alive && !silent) setLoading(false);
      }
    };

    load(false);
    // Khoảng ngày dài (> 31 ngày, xem theo tháng / năm): tự tải lại mỗi phút thay vì mỗi REFRESH_MS cho đỡ nặng server
    const long = listDays(query.dateFrom, query.dateTo, Number.MAX_SAFE_INTEGER).length > 31;
    const id = setInterval(() => load(true), long ? 60000 : REFRESH_MS);
    const onShow = () => { if (!document.hidden) load(true); };
    document.addEventListener("visibilitychange", onShow);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onShow); };
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
    // Gom theo mã lỗi, giữ danh sách SN / công đoạn / thời gian để bấm vào cột xem chi tiết
    const byCode = new Map<string, DefectDetail[]>();
    data.defectRecords.forEach(r => {
      if (view.hrs.indexOf(r.slot) < 0) return;
      if (!all && picked.indexOf(normStage(r.stage)) < 0) return;
      const list = byCode.get(r.code) || [];
      list.push({ sn: r.sn, stage: r.stage, errorStage: r.errorStage, returnStage: r.returnStage, status: r.status, time: r.time, code: r.code, name: errorNames.get(r.code) || r.errorName,
        position: r.position });
      byCode.set(r.code, list);
    });
    // Tên lỗi: MDM, không có thì lấy errorName của SerialnumberErrorHistory
    const nameOf = (code: string, details: DefectDetail[]) =>
      errorNames.get(code) || (details.filter(d => d.name)[0] || { name: "" }).name || code;
    return buildPareto(Array.from(byCode, ([code, details]) => ({ name: nameOf(code, details), count: details.length, details })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, selected, errorNames, pareto]);

  // Bấm ô Fail của bảng công đoạn: SN lỗi của công đoạn đó trong khung giờ đó (dòng Tổng: cả các khung giờ đang xem)
  const [cellPick, setCellPick] = useState<{ stage: number; row: number } | null>(null);
  const closeCell = useCallback(() => setCellPick(null), []);
  const cellPanel = useMemo(() => {
    if (!cellPick || !data || !view || !data.defectRecords) return null;
    const stage = stageNames[cellPick.stage];
    if (stage === undefined) return null;
    const hrs = cellPick.row < 0 ? view.hrs : [view.hrs[cellPick.row]];
    const details: DefectDetail[] = data.defectRecords
      .filter(r => hrs.indexOf(r.slot) >= 0 && normStage(r.stage) === normStage(stage))
      .map(r => ({ sn: r.sn, stage: r.stage, errorStage: r.errorStage, returnStage: r.returnStage, status: r.status, time: r.time, code: r.code, name: errorNames.get(r.code) || r.errorName,
        position: r.position }))
      .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
    // Đếm theo tên lỗi: "Lệch linh kiện 2 · Hàn giả 1"
    const byName = new Map<string, number>();
    details.forEach(d => byName.set(d.name || d.code, (byName.get(d.name || d.code) || 0) + 1));
    const slot = cellPick.row < 0 ? t("xl.total") : view.rows[cellPick.row].slot;
    return {
      item: { name: `${stage} · ${slot}`, color: "#d63b3b", count: details.length, details },
      sub: t("pareto.snSub", { n: details.length, s: Array.from(byName, ([s, c]) => `${s} ${c}`).join(" · ") || "—" })
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellPick, data, view, selected, errorNames]);

  // Ô Tổng lỗi theo ca (và khung giờ, công đoạn) đang xem: tổng Fail của ca (= biểu đồ Defect Detail, = cột Fail của bảng)
  const shiftDefects = view ? view.totalFail : 0;
  // Số SN lỗi trong ca / khung giờ / công đoạn đang xem (SN khác nhau)
  const defectSns = useMemo(() => {
    if (!data || !view || !data.defectRecords) return null;
    const all = selected.length === stageNamesAll.length;
    const picked = stageNames.map(normStage);
    const sns = new Set<string>();
    data.defectRecords.forEach(r => {
      if (view.hrs.indexOf(r.slot) < 0 || !r.sn) return;
      if (!all && picked.indexOf(normStage(r.stage)) < 0) return;
      sns.add(r.sn);
    });
    return sns.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, selected]);

  const topStage = useMemo(() => {
    if (!view || !view.totalFail || !view.failByStage.length) return null;
    const j = view.failByStage.indexOf(Math.max(...view.failByStage));
    return view.failByStage[j] > 0 ? { name: stageNames[j], fail: view.failByStage[j] } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // PM Plan: Model = mã sản phẩm, InputGroup = công đoạn đầu, OutputGroup = VMI (hoặc công đoạn cuối);
  // WO chưa cấu hình công đoạn thì vẫn hiện mã sản phẩm, hai nhóm để "—"
  // Nhiều WO (tất cả WO của model): mỗi mã sản phẩm một dòng
  const pmPlan = data
    ? data.products.filter((p, i, a) => p.code && a.findIndex(x => x.code === p.code) === i)
      .map(p => ({ model: p.code, inputGroup: p.inputGroup, outputGroup: p.outputGroup }))
    : [];
  // Sản lượng thực tế ca = tổng Pass tại OutputGroup (của từng WO) trong các khung giờ đang xem
  const shiftOutput = data && view ? sum(view.hrs.map(h => data.outByHour[h])) : 0;

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
  // wo: WO vừa chọn trong danh sách (chưa kịp vào state woLine; nhiều WO cách nhau dấu phẩy); không truyền thì dùng ô WO-Line
  // m, l: model / dây chuyền (mặc định đang chọn); wo = ALL_WO: gộp tất cả WO của model (trên dây chuyền đang chọn)
  const onSearch = (picked?: string, m: string = model, l: string = line, p: string = product, ds = dates) => {
    const wo = (picked !== undefined ? picked : woLine).trim();
    const all = wo === ALL_WO;
    // WO tạo sau ngày cuối đang xem thì chưa thể có số liệu: bỏ qua cho đỡ tải
    const wos = all ? woAll.filter(x => (m || p) && matchWo(x, m, l, p) && !(x.created > ds.to)).map(x => x.wo) : parseWos(wo);
    if (!wos.length || (all && !m && !p)) {
      toast.error(t("msg.needWo"));
      return;
    }
    const key = all ? ALL_WO : wos.join(",");
    setWoLine(key);
    try { localStorage.setItem("kanban-wo", key); } catch { /* bỏ qua */ }
    const sumWos = all ? woAll.filter(x => matchWo(x, m, l, p)).map(x => x.wo) : wos;
    setQuery({ woLine: key, wos, sumWos, model: m, product: p, line: l, dateFrom: ds.from, dateTo: ds.to });
    setReloadKey(k => k + 1);
  };
  // Bỏ lọc: đưa mọi ô lọc về mặc định (mọi model / sản phẩm / dây chuyền, hôm nay, ca tự động, cả khung giờ, mọi công đoạn)
  // rồi tải lại. Giữ WO đang xem; đang xem "Tất cả WO" (cần model) thì chuyển sang WO mới nhất.
  const onReset = () => {
    setShiftMode("auto"); setRange(null); setStageSel(null);
    const d = productionDate(), ds = { from: d, to: d };
    setDates(ds);
    setModel(""); setProduct(""); setLine("");
    try {
      localStorage.setItem("kanban-model", ""); localStorage.setItem("kanban-product", ""); localStorage.setItem("kanban-line", "");
    } catch { /* bỏ qua */ }
    const wo = woLine && woLine !== ALL_WO ? woLine : (woAll[0] ? woAll[0].wo : "");
    if (wo) onSearch(wo, "", "", "", ds);
  };

  // Model → Dây chuyền → WO-Line: danh sách A→Z kèm số WO; dây chuyền chỉ hiện các dây chuyền có WO của model đang
  // chọn; ô WO-Line chỉ còn WO thuộc cả model lẫn dây chuyền đang chọn (mới nhất trước)
  const countBy = (list: WoInfo[], key: (x: WoInfo) => string) => {
    const m = new Map<string, number>();
    list.forEach(x => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return Array.from(m.entries()).map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  };
  const models = useMemo(() => countBy(woAll, x => x.model), [woAll]);
  const products = useMemo(() => countBy(woAll.filter(x => matchWo(x, model, "")), x => x.product), [woAll, model]);
  const lines = useMemo(() => countBy(woAll.filter(x => matchWo(x, model, "", product)), x => x.line), [woAll, model, product]);
  const woLines = useMemo(() => woAll.filter(x => matchWo(x, model, line, product)).map(x => x.wo), [woAll, model, line, product]);
  // Đổi model / dây chuyền: đang xem tất cả WO của model thì gộp lại theo bộ lọc mới; WO đang xem không còn trong
  // danh sách thì tải ngay WO mới nhất của danh sách mới
  const applyFilter = (m: string, l: string, p: string) => {
    if (p && !woAll.some(x => matchWo(x, m, "", p))) p = "";   // sản phẩm không thuộc model này: bỏ lọc sản phẩm
    if (l && !woAll.some(x => matchWo(x, m, l, p))) l = "";   // không có WO trên dây chuyền này: bỏ lọc dây chuyền
    setModel(m);
    setProduct(p);
    setLine(l);
    try {
      localStorage.setItem("kanban-model", m); localStorage.setItem("kanban-product", p); localStorage.setItem("kanban-line", l);
    } catch { /* bỏ qua */ }
    const list = woAll.filter(x => matchWo(x, m, l, p)).map(x => x.wo);
    // Các WO đang chọn: giữ WO còn trong danh sách mới; không còn WO nào thì xem WO mới nhất
    const cur = woLine === ALL_WO ? [] : parseWos(woLine);
    const kept = cur.filter(w => list.indexOf(w) >= 0);
    if (woLine === ALL_WO && (m || p)) onSearch(ALL_WO, m, l, p);
    else if (!kept.length) { if (list.length) onSearch(list[0], m, l, p); }
    else if (kept.length < cur.length) onSearch(kept.join(","), m, l, p);
  };
  const onModel = (m: string) => applyFilter(m, line, product);
  const onProduct = (p: string) => applyFilter(model, line, p);
  const onLine = (l: string) => applyFilter(model, l, product);

  // Tỷ lệ đạt theo ngày / tháng / năm: tự lấy (không theo bộ lọc ngày / ca), theo các WO đang xem, nhóm theo công đoạn đầu
  const yieldSrc = useMemo<YieldSource | null>(() => {
    if (!data) return null;
    const groups: { stage: string; wos: string[] }[] = [];
    data.products.forEach(p => {
      if (!p.inputGroup || p.inputGroup === "—") return;
      const g = groups.find(x => x.stage === p.inputGroup);
      if (g) { if (g.wos.indexOf(p.wo) < 0) g.wos.push(p.wo); } else groups.push({ stage: p.inputGroup, wos: [p.wo] });
    });
    return { wos: ([] as string[]).concat(...groups.map(g => g.wos)), groups };
  }, [data]);
  const periods = {
    day: usePeriodYield(yieldSrc, "day", authToken),
    month: usePeriodYield(yieldSrc, "month", authToken),
    year: usePeriodYield(yieldSrc, "year", authToken)
  };

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
        { key: "defect", title: t("xl.defChart") },
        { key: "yield", title: t("xl.yieldChart") }
      ]);
      await exportKanbanExcel({
        t, locale, st, shiftKey: shift.key, shiftRangeText: shiftRange(shift, t("nextDay")),
        dateRange: { from: query.dateFrom, to: query.dateTo },
        fromLabel: SLOTS[from].split("-")[0], toLabel: SLOTS[to].split("-")[1],
        woCode: data.woCode,
        woFilter: {
          model: query.model, product: query.product, line: query.line,
          // Tất cả WO: các WO có chạy (đã gộp); tự chọn: các WO đã chọn
          wos: query.woLine === ALL_WO ? data.products.map(p => p.wo) : query.wos
        },
        products: data.products.length > 1
          ? data.products.map(p => ({ name: `${p.wo} – ${p.name || p.code}`, plan: p.plan, done: p.done }))
          : [{ name: data.productName || data.productCode, plan: data.plan, done: data.done }],
        pmPlan, allStages: data.stages.length, stageNames, view, outside, pareto: paretoView,
        totalDefects: shiftDefects, inputTotal: sum(view.input), defectSns, periods, topDefect: paretoView.items[0], paretoScope, topStage,
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
        products={products} product={product} onProduct={onProduct}
        lines={lines} line={line} onLine={onLine}
        models={models} model={model} onModel={onModel}
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
              totalDefects={shiftDefects} input={sum(view.input)} defectSns={defectSns}
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
                {/* Tỷ lệ đạt (1 − lỗi / Input) theo ngày / theo giờ so với mục tiêu 95%; dưới mục tiêu báo đỏ */}
                <HourlyYieldChart night={night} periods={periods}
                  byHour={{ input: view.input, fail: view.failByHour, labels: view.labels }} />
              </section>

              <StageTable stageNames={stageNames} rows={view.rows} outside={outside} noStages={!data.stages.length}
                totals={view.totals} onPick={data.defectRecords ? (stage, row) => setCellPick({ stage, row }) : undefined} />
              {cellPanel && <DefectSnPanel item={cellPanel.item} sub={cellPanel.sub} hideStage onClose={closeCell} />}
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
