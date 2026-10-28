import React from "react";
import { createRoot } from "react-dom/client";
import { HourlyOutputReport } from "../../harness/src/app/report/HourlyOutputReport";
import "./tv.css";

// TV luôn mở ở chế độ "Xem toàn bộ" (vừa khít một màn hình), trừ khi người dùng đã tắt
try {
  if (localStorage.getItem("kanban-fit") === null) localStorage.setItem("kanban-fit", "1");
} catch { /* bỏ qua */ }

/* ---------- Điều khiển bằng remote: phím mũi tên chuyển giữa các nút / ô, OK để bấm ---------- */
const FOCUSABLE = "button:not([disabled]):not([tabindex='-1']), input:not([disabled]), select:not([disabled]), [tabindex='0']";

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function moveFocus(dir: string) {
  const all = Array.prototype.slice.call(document.querySelectorAll(FOCUSABLE)).filter(visible) as HTMLElement[];
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || all.indexOf(cur) < 0) {
    if (all[0]) all[0].focus();
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  all.forEach(el => {
    if (el === cur) return;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const main = dir === "ArrowLeft" ? -dx : dir === "ArrowRight" ? dx : dir === "ArrowUp" ? -dy : dy;
    const side = dir === "ArrowLeft" || dir === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    if (main <= 1) return;
    const score = main + side * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  });
  if (best) (best as HTMLElement).focus();
}

document.addEventListener("keydown", e => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
  const el = document.activeElement as HTMLElement | null;
  // Trong ô nhập: ←/→ di chuyển con trỏ chữ, ↑/↓ để ô WO-Line tự xử lý khi danh sách đang mở
  if (el && el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox") {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const inp = el as HTMLInputElement;
      const atEdge = e.key === "ArrowLeft" ? inp.selectionStart === 0 : inp.selectionEnd === inp.value.length;
      if (!atEdge) return;
    } else if (el.closest(".wo-combo") && document.querySelector(".wo-dash .wo-menu")) {
      return;
    }
  }
  if (el && el.tagName === "SELECT") return;
  e.preventDefault();
  moveFocus(e.key);
}, true);

// Viền sáng cho phần tử đang được chọn bằng remote
document.addEventListener("focusin", e => { (e.target as HTMLElement).classList.add("tv-focus"); });
document.addEventListener("focusout", e => { (e.target as HTMLElement).classList.remove("tv-focus"); });

createRoot(document.getElementById("root") as HTMLElement).render(<HourlyOutputReport />);

// Lúc mở không chọn sẵn ô nào (tránh bật bàn phím ảo / cuộn tới ô nhập); bấm phím mũi tên mới bắt đầu chọn
const blurInitial = () => {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && el.blur) el.blur();
};
[500, 2000, 5000].forEach(ms => setTimeout(blurInitial, ms));
