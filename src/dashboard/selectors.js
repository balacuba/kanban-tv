import { SLOTS, HOURS, PALETTE, shiftSlots } from "./constants";
import { sum } from "./format";

// Ma trận [khung giờ][công đoạn] = [pass, fail]; thiếu thì 0
export function buildRows(data) {
  return SLOTS.map(s => data.stages.map((_, i) => (data.stageRows[s] || [])[i] || [0, 0]));
}

// Số liệu cho ca đang xem sau khi lọc khung giờ + công đoạn
export function computeShiftView(data, rows, { shiftIndex, from, to, stages }) {
  const hrs = shiftSlots(shiftIndex).filter(i => i >= from && i <= to);
  const sub = hrs.map(h => stages.map(s => rows[h][s]));
  const failByHour = sub.map(r => sum(r.map(([, f]) => f)));
  const failByStage = stages.map((_, j) => sum(sub.map(r => r[j][1])));
  const passByStage = stages.map((_, j) => sum(sub.map(r => r[j][0])));
  return {
    hrs,
    rows: sub.map((cells, k) => ({ slot: SLOTS[hrs[k]], cells })),
    totals: stages.map((_, j) => [passByStage[j], failByStage[j]]),
    failByHour,
    failByStage,
    totalFail: sum(failByHour),
    labels: hrs.map(i => HOURS[i]),
    input: hrs.map(i => data.inputByHour[SLOTS[i]] || 0),
    output: hrs.map(i => data.outputByHour[SLOTS[i]] || 0),
  };
}

// Sản lượng thực tế của một công đoạn (tổng Pass) trong các khung giờ hrs — dùng cho OutputGroup của PM Plan
export function computeStageOutput(data, rows, hrs, stageName) {
  const idx = data.stages.indexOf(stageName);
  return idx < 0 ? 0 : sum(hrs.map(h => rows[h][idx][0]));
}

// Gộp các dòng lỗi cùng tên (dữ liệu có thể tách theo công đoạn), giữ cờ est nếu có dòng nào ước tính
function groupDefects(defects) {
  const byName = new Map();
  for (const d of defects) {
    const g = byName.get(d.name) ?? { name: d.name, count: 0, est: false };
    g.count += d.count;
    g.est ||= !!d.est;
    byName.set(d.name, g);
  }
  return [...byName.values()];
}

// Màu đỏ nhạt dần theo hạng lỗi: lỗi nhiều nhất đỏ đậm, lỗi cuối hồng nhạt
const redShade = (i, n) => {
  const k = n > 1 ? i / (n - 1) : 0;
  return `hsl(${Math.round(358 + 6 * k) % 360}, ${Math.round(72 - 8 * k)}%, ${Math.round(38 + 44 * k)}%)`;
};

// Pareto: (lọc theo danh sách công đoạn nếu có) sắp giảm dần, tính tỷ lệ, tích lũy và nhóm lỗi chính (cộng dồn tới khi chạm 80%)
export function computePareto(defects, stages = null) {
  const picked = stages ? defects.filter(d => stages.includes(d.stage)) : defects;
  const sorted = groupDefects(picked).sort((a, b) => b.count - a.count);
  const total = sum(sorted.map(d => d.count));
  let cum = 0;
  const items = sorted.map((d, i) => {
    const before = cum;
    cum += d.count;
    return {
      ...d,
      color: PALETTE[i % PALETTE.length],   // màu cột
      ring: redShade(i, sorted.length),     // màu vòng điểm trên đường tích lũy
      share: total ? d.count / total : 0,
      cum: total ? cum / total : 0,
      main: total ? before / total < 0.8 : false,
    };
  });
  return { items, total, mainCount: items.filter(d => d.main).length };
}

// Tỷ lệ lỗi = tổng lỗi / số lượng đầu vào tại InputGroup của PM Plan (cả ngày)
export function computeDefectRate(data, rows, totalDefects) {
  const inputIdx = data.stages.indexOf(data.pmPlan[0]?.inputGroup);
  if (inputIdx < 0) return 0;
  const totalInput = sum(rows.map(r => r[inputIdx][0] + r[inputIdx][1]));
  return totalInput ? totalDefects / totalInput : 0;
}
