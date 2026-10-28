// Một ngày sản xuất = ca ngày 08:00–20:00 + ca đêm 20:00–08:00 hôm sau, mỗi ca 12 khung giờ.
// Nhà máy đổi giờ ca thì chỉ cần sửa SHIFTS.
export const SHIFTS = [
  { key: "day", name: "Ca ngày", from: 8, hours: 12 },
  { key: "night", name: "Ca đêm", from: 20, hours: 12 },
];

// SLOTS: tên khung giờ theo đúng định dạng backend trả về ("8:00-9:00"), xếp theo thứ tự ca
export const SLOTS = [];
export const SLOT_SHIFT = [];
SHIFTS.forEach((s, si) => {
  for (let k = 0; k < s.hours; k++) {
    const h = (s.from + k) % 24;
    SLOTS.push(`${h}:00-${(h + 1) % 24}:00`);
    SLOT_SHIFT.push(si);
  }
});
export const HOURS = SLOTS.map(s => s.split("-")[0]);

export const PALETTE = ["#3b6fd8", "#e8743b", "#19a979", "#e8a13b", "#d64f8a", "#7b5bd6", "#1fa5c4",
  "#d64545", "#2f8f3a", "#c9a07a", "#b5b84a", "#c77fd6", "#7f8a96"];

// Kiểm tra đổi ca mỗi 30 giây
export const SHIFT_CHECK_MS = 30000;

export const pad2 = h => String(h).padStart(2, "0");
// nextDay: chữ "hôm sau" theo ngôn ngữ đang chọn
export const shiftRange = (s, nextDay = " hôm sau") =>
  `${pad2(s.from)}:00 – ${pad2((s.from + s.hours) % 24)}:00${s.from + s.hours > 24 ? nextDay : ""}`;
export const shiftSlots = si => SLOTS.map((_, i) => i).filter(i => SLOT_SHIFT[i] === si);

// Ca đang chạy theo giờ của máy
export const currentShift = (hour = new Date().getHours()) =>
  SHIFTS.findIndex(s => (hour - s.from + 24) % 24 < s.hours);

// Khoảng ngày lọc {from, to} dạng "YYYY-MM-DD": số ngày và nhãn hiển thị (dd/mm/yyyy)
export const dayCount = ({ from, to }) => Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
const viDate = s => s.split("-").reverse().join("/");
export const rangeLabel = r => (r.from === r.to ? viDate(r.from) : `${viDate(r.from)} – ${viDate(r.to)}`);

// Ngày sản xuất: từ 0:00 đến trước giờ bắt đầu ca ngày vẫn thuộc ca đêm của ngày hôm trước
export function productionDate(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < SHIFTS[0].from) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
