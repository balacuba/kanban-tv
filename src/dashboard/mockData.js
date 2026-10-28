// Dữ liệu mẫu WO 11122610110-1, ngày 2026-10-26 — dùng tạm cho tới khi nối backend.
// Đúng định dạng mà fetchDashboard() trong api.js mong đợi.
export const MOCK_DASHBOARD = {
  woCode: "11122610110-1",
  products: [{ name: "PCB PCA BAM2510 NAPBOARD VER1.3 V35V35T1.6 BLACK", plan: 4400, done: 526 }],
  pmPlan: [{ model: "1200400116", inputGroup: "SMT-PCB-AOI-TOP", outputGroup: "VMI", planOutput: 0 }],
  stages: ["SMT-PCB-AOI-TOP", "SMT-PCB-AOI-BOT", "ICT", "FCT", "VMI", "OQC", "WH_IN"],
  stageRows: {
    "8:00-9:00":   [[0, 0], [0, 0], [24, 0], [24, 0], [48, 0], [0, 0], [0, 0]],
    "9:00-10:00":  [[28, 0], [28, 0], [72, 0], [72, 0], [48, 0], [96, 0], [0, 0]],
    "10:00-11:00": [[48, 0], [48, 0], [86, 0], [85, 0], [96, 0], [143, 0], [383, 0]],
    "11:00-12:00": [[104, 0], [104, 0], [95, 0], [94, 1], [96, 0], [95, 1], [0, 0]],
    "12:00-13:00": [[44, 0], [44, 0], [34, 0], [33, 0], [0, 0], [0, 0], [143, 0]],
    "13:00-14:00": [[144, 3], [144, 0], [84, 0], [84, 0], [48, 0], [94, 2], [0, 0]],
    "14:00-15:00": [[168, 2], [168, 0], [87, 1], [86, 0], [96, 0], [95, 1], [0, 0]],
    "15:00-16:00": [[68, 1], [68, 0], [74, 0], [51, 0], [48, 0], [0, 0], [0, 0]],
    "16:00-17:00": [[136, 9], [136, 0], [84, 0], [31, 0], [48, 0], [90, 6], [0, 0]],
    "17:00-18:00": [[72, 4], [72, 0], [47, 0], [47, 0], [48, 0], [48, 0], [0, 0]],
    "18:00-19:00": [[116, 3], [112, 0], [57, 0], [36, 1], [48, 0], [47, 1], [0, 0]],
    "19:00-20:00": [[72, 3], [76, 0], [26, 0], [15, 0], [48, 0], [48, 0], [0, 0]],
  },
  inputByHour: {
    "9:00-10:00": 28, "10:00-11:00": 48, "11:00-12:00": 104, "12:00-13:00": 44, "13:00-14:00": 144, "14:00-15:00": 168,
    "15:00-16:00": 68, "16:00-17:00": 136, "17:00-18:00": 72, "18:00-19:00": 116, "19:00-20:00": 72,
  },
  outputByHour: { "10:00-11:00": 383, "12:00-13:00": 143 },
  // Mỗi dòng: loại lỗi + công đoạn phát hiện (stage). Cùng loại lỗi ở nhiều công đoạn thì tách nhiều dòng.
  // Công đoạn ở đây là phân bổ giả định cho dữ liệu mẫu; tổng vẫn đúng 62 lỗi như ảnh gốc.
  defects: [
    { name: "Dựng linh kiện", stage: "SMT-PCB-AOI-TOP", count: 14 },
    { name: "Dựng linh kiện", stage: "OQC", count: 4 },
    { name: "Hàn giả", stage: "SMT-PCB-AOI-TOP", count: 7 },
    { name: "Hàn giả", stage: "FCT", count: 3 },
    { name: "Hàn giả", stage: "OQC", count: 2 },
    { name: "Lệch linh kiện", stage: "SMT-PCB-AOI-TOP", count: 8 },
    { name: "KENH LINH KIEN", stage: "SMT-PCB-AOI-TOP", count: 4 },
    { name: "Không kết nối", stage: "ICT", count: 3 },
    { name: "Không kết nối", stage: "FCT", count: 1 },
    { name: "Thiếu thiếc", stage: "SMT-PCB-AOI-TOP", count: 4 },
    { name: "Thieu linh kien", stage: "SMT-PCB-AOI-TOP", count: 2 },
    { name: "Không bám kem hàn", stage: "SMT-PCB-AOI-TOP", count: 2 },
    { name: "Lỗi điện trở", stage: "ICT", count: 2 },
    { name: "Chân linh kiện biến dạng", stage: "OQC", count: 2 },
    { name: "Kênh chân linh kiện", stage: "SMT-PCB-AOI-TOP", count: 2, est: true },
    { name: "THỪA LINH KIỆN", stage: "OQC", count: 1, est: true },
    { name: "Lệch linh kiện (mục 2)", stage: "OQC", count: 1 },
  ],
};

export const MOCK_WO_LINES = ["11122610110-1"];

// Chỉ để thử giao diện: lọc nhiều ngày thì nhân số liệu mẫu theo số ngày (như cộng dồn các ngày giống nhau)
export function mockForDays(base, days) {
  if (days <= 1) return base;
  const times = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * days]));
  return {
    ...base,
    products: base.products.map(p => ({ ...p, plan: p.plan * days, done: p.done * days })),
    stageRows: Object.fromEntries(Object.entries(base.stageRows).map(([s, cells]) => [s, cells.map(([p, f]) => [p * days, f * days])])),
    inputByHour: times(base.inputByHour),
    outputByHour: times(base.outputByHour),
    defects: base.defects.map(d => ({ ...d, count: d.count * days })),
  };
}

// Chỉ để thử giao diện: thêm công đoạn giả cho đủ `count` (mở trang với ?stages=20).
// Số liệu sinh cố định theo vị trí nên lần nào mở cũng giống nhau.
const EXTRA_STAGES = ["SPI", "REFLOW-TOP", "REFLOW-BOT", "X-RAY", "ICT-2", "FCT-FINAL", "PACKING", "QA-SAMPLING",
  "BURN-IN", "LABEL", "DIP", "WAVE-SOLDER", "CONFORMAL", "AOI-FINAL", "RUN-IN", "HI-POT", "SHIPPING"];

export function mockWithStages(base, count) {
  const extra = EXTRA_STAGES.slice(0, Math.max(0, count - base.stages.length));
  if (!extra.length) return base;
  const stageRows = {};
  for (const [slot, cells] of Object.entries(base.stageRows)) {
    const smtPass = cells[0][0];
    stageRows[slot] = [...cells, ...extra.map((_, k) => {
      const pass = Math.max(0, Math.round(smtPass * (0.95 - k * 0.03)));
      const fail = pass && (smtPass + k * 7) % 11 === 0 ? 1 + (k % 3) : 0;
      return [pass, fail];
    })];
  }
  return { ...base, stages: [...base.stages, ...extra], stageRows };
}
