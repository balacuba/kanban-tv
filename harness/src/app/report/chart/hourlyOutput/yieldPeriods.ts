import { useEffect, useState } from "react";
import axios from "axios";
import { PLANNING_API_URL } from "../../../../config";
import { addDays, pad2, productionDate, SHIFTS } from "./KanbanShared";

/**
 * Tỷ lệ đạt theo ngày / tháng / năm cho biểu đồ "Tỷ lệ đạt / Input" — tự lấy, không theo bộ lọc ngày / ca / khung giờ /
 * công đoạn (chỉ theo các WO đang xem). Đếm thẳng trên ProductSerialNumberTestHistory bằng /search/count:
 * - Lỗi  = số bản ghi tại trạm sửa (stageName bắt đầu "R_")  — bằng tổng Fail của get-daily-report.
 * - Input = số bản ghi có preStageName = công đoạn đầu của WO, trừ các bản ghi trong đó chuyển sang trạm sửa (R_)
 *           — bằng stage0_pass của get-daily-report.
 * Kỳ tính theo ngày sản xuất (từ giờ bắt đầu ca ngày, 08:00, đến 08:00 hôm sau), gồm cả ca ngày và ca đêm:
 * 30 ngày gần nhất, 12 tháng gần nhất, 3 năm gần nhất. Số của kỳ đã qua không đổi nên được lưu lại trên máy;
 * kỳ hiện tại (hôm nay / tháng này / năm nay) đếm lại mỗi phút.
 */
export type Period = "day" | "month" | "year";
export interface PeriodSeries { keys: string[]; labels: string[]; input: number[]; fail: number[]; }
// WO đang xem, nhóm theo công đoạn đầu (các WO có thể bắt đầu ở công đoạn khác nhau)
export interface YieldSource { wos: string[]; groups: { stage: string; wos: string[] }[]; }

const DAYS = 30, MONTHS = 12, YEARS = 3;
const START = `${pad2(SHIFTS[0].from)}:00:00`;
const LIMIT = 3;                 // số lần đếm gửi cùng lúc
const REFRESH = 60000;           // đếm lại kỳ hiện tại
const STORE = "kanban-yield-cache";

interface Slot { key: string; label: string; from: string; to: string; current: boolean; }

function slots(period: Period): Slot[] {
  const today = productionDate();
  const [y, m] = today.split("-").map(Number);
  const out: Slot[] = [];
  if (period === "day") {
    for (let k = DAYS - 1; k >= 0; k--) {
      const d = addDays(today, -k);
      out.push({ key: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, from: d, to: addDays(d, 1), current: k === 0 });
    }
  } else if (period === "month") {
    for (let k = MONTHS - 1; k >= 0; k--) {
      const a = new Date(y, m - 1 - k, 1), b = new Date(y, m - k, 1);
      const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
      out.push({ key: iso(a).slice(0, 7), label: `${pad2(a.getMonth() + 1)}/${a.getFullYear()}`, from: iso(a), to: iso(b), current: k === 0 });
    }
  } else {
    for (let k = YEARS - 1; k >= 0; k--) {
      out.push({ key: String(y - k), label: String(y - k), from: `${y - k}-01-01`, to: `${y - k + 1}-01-01`, current: k === 0 });
    }
  }
  return out;
}

// Giới hạn số lần đếm cùng lúc (server chịu tải kém)
let running = 0;
const waiting: (() => void)[] = [];
const acquire = () => (running < LIMIT ? (running++, Promise.resolve()) : new Promise<void>(r => { waiting.push(r); }));
const release = () => { const n = waiting.shift(); if (n) n(); else running--; };

async function count(conditions: any[], auth: any): Promise<number> {
  await acquire();
  try {
    for (let k = 0; ; k++) {
      try {
        const res = await axios.post(`${PLANNING_API_URL}/rest/entities/ProductSerialNumberTestHistory/search/count`,
          { filter: { conditions } }, auth);
        return Number(res.data) || 0;
      } catch (err: any) {
        if (k >= 2 || !(err?.response?.status >= 500)) throw err;
        await new Promise(r => setTimeout(r, k ? 1200 : 400));
      }
    }
  } finally {
    release();
  }
}

// Bộ nhớ các kỳ đã qua: "nguồn|kỳ" → [input, lỗi]
const mem = new Map<string, [number, number]>();
(() => {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]) => mem.set(k, v as [number, number]));
  } catch { /* bỏ qua */ }
})();
const save = () => {
  try {
    const obj: { [k: string]: [number, number] } = {};
    Array.from(mem.entries()).slice(-3000).forEach(([k, v]) => { obj[k] = v; });   // giữ gọn
    localStorage.setItem(STORE, JSON.stringify(obj));
  } catch { /* bỏ qua */ }
};

async function countSlot(src: YieldSource, s: Slot, auth: any): Promise<[number, number]> {
  const time = [
    { property: "testTime", operator: ">=", value: `${s.from}T${START}` },
    { property: "testTime", operator: "<", value: `${s.to}T${START}` }
  ];
  const wo = (wos: string[]) => (wos.length === 1
    ? { property: "workOrderCode", operator: "=", value: wos[0] }
    : { property: "workOrderCode", operator: "in", value: wos });
  const repair = { property: "stageName", operator: "startsWith", value: "R_" };
  const [fail, ...ins] = await Promise.all([
    count([wo(src.wos), ...time, repair], auth),
    ...src.groups.map(g => count([wo(g.wos), ...time, { property: "preStageName", operator: "=", value: g.stage }], auth)),
    ...src.groups.map(g => count([wo(g.wos), ...time, { property: "preStageName", operator: "=", value: g.stage }, repair], auth))
  ]);
  const n = src.groups.length;
  let input = 0;
  for (let i = 0; i < n; i++) input += Math.max(0, ins[i] - ins[n + i]);
  return [input, fail];
}

const srcKey = (src: YieldSource) =>
  src.groups.map(g => `${g.stage}:${g.wos.slice().sort().join(",")}`).sort().join(";");

/** Số liệu của một kiểu kỳ; null khi đang tải lần đầu. Lỗi khi đếm thì kỳ đó = 0 (thử lại ở lần sau). */
export function usePeriodYield(src: YieldSource | null, period: Period, authToken?: string) {
  const [data, setData] = useState<PeriodSeries | null>(null);
  const key = src ? srcKey(src) : "";
  useEffect(() => {
    if (!src || !src.wos.length || !src.groups.length || !authToken) { setData(null); return undefined; }
    let alive = true;
    const auth = { headers: { Authorization: `Bearer ${authToken}` } };
    const list = slots(period);
    const run = async (first: boolean) => {
      // Lần đầu: hiện ngay các kỳ đã lưu, đếm các kỳ còn thiếu; sau đó chỉ đếm lại kỳ hiện tại
      const need = list.filter(s => s.current || !mem.has(`${key}|${s.key}`));
      if (first) setData(null);
      const got = await Promise.all(need.map(s => countSlot(src, s, auth).catch(() => null)));
      if (!alive) return;
      need.forEach((s, i) => { const v = got[i]; if (v) mem.set(`${key}|${s.key}`, v); });
      save();
      const vals = list.map(s => mem.get(`${key}|${s.key}`) || [0, 0]);
      setData({ keys: list.map(s => s.key), labels: list.map(s => s.label), input: vals.map(v => v[0]), fail: vals.map(v => v[1]) });
    };
    run(true);
    const id = setInterval(() => run(false), REFRESH);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, period, authToken]);
  return data;
}
