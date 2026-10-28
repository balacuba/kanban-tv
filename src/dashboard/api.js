import { MOCK_DASHBOARD, MOCK_WO_LINES, mockForDays, mockWithStages } from "./mockData";
import { dayCount } from "./constants";

/*
 * Lớp gọi backend. Hiện đang trả dữ liệu mẫu; khi có API thì bật USE_MOCK = false
 * và chỉnh URL / map trường trong normalizeDashboard() cho khớp backend.
 *
 * Định dạng dashboard mà giao diện dùng:
 * {
 *   woCode: "11122610110-1",
 *   products: [{ name, plan, done }],
 *   pmPlan:   [{ model, inputGroup, outputGroup, planOutput }],
 *   stages:   ["SMT-PCB-AOI-TOP", ...],                 // tối đa ~15 công đoạn
 *   stageRows: { "8:00-9:00": [[pass, fail], ...] },     // mỗi phần tử theo đúng thứ tự stages
 *   inputByHour:  { "9:00-10:00": 28, ... },
 *   outputByHour: { "10:00-11:00": 383, ... },
 *   defects: [{ name, stage?, count, est? }],            // stage = công đoạn phát hiện lỗi (để lọc Pareto),
 *                                                        // est = true nếu số chưa chắc chắn
 * }
 * Khung giờ hoặc công đoạn nào thiếu đều được coi là 0.
 */
const USE_MOCK = true;
const API_BASE = "/api";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi ${url}`);
  return res.json();
}

// Danh sách WO Line cho ô chọn
export async function fetchWoLines() {
  if (USE_MOCK) return MOCK_WO_LINES;
  return getJson(`${API_BASE}/wo-lines`);
}

// Dữ liệu dashboard của một WO Line trong khoảng ngày sản xuất [dateFrom, dateTo] (gồm cả hai đầu).
// Backend cộng dồn số liệu các ngày trong khoảng theo từng khung giờ / công đoạn / loại lỗi.
export async function fetchDashboard({ woLine, dateFrom, dateTo }) {
  if (USE_MOCK) {
    // Thử nhiều công đoạn: mở trang với ?stages=20
    const n = Number(new URLSearchParams(window.location.search).get("stages")) || 0;
    const days = Math.max(1, dayCount({ from: dateFrom, to: dateTo }));
    return normalizeDashboard(mockForDays(mockWithStages(MOCK_DASHBOARD, n), days));
  }
  const qs = new URLSearchParams({ woLine, dateFrom, dateTo });
  return normalizeDashboard(await getJson(`${API_BASE}/wo-line/dashboard?${qs}`));
}

// Lưu kế hoạch sản lượng ca (PlanOutput) người dùng nhập
export async function savePlanOutput({ woCode, dateFrom, dateTo, shift, planOutput }) {
  if (USE_MOCK) return;
  const res = await fetch(`${API_BASE}/wo-line/plan-output`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ woCode, dateFrom, dateTo, shift, planOutput }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi lưu PlanOutput`);
}

// Đưa dữ liệu backend về đúng định dạng giao diện cần; trường thiếu thì dùng giá trị rỗng
export function normalizeDashboard(raw) {
  return {
    woCode: raw.woCode ?? "",
    products: raw.products ?? [],
    pmPlan: raw.pmPlan ?? [],
    stages: raw.stages ?? [],
    stageRows: raw.stageRows ?? {},
    inputByHour: raw.inputByHour ?? {},
    outputByHour: raw.outputByHour ?? {},
    defects: raw.defects ?? [],
  };
}
