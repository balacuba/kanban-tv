import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { currentShift, SHIFT_CHECK_MS } from "./constants";
import { fetchDashboard } from "./api";

// Kích thước thật của một phần tử (biểu đồ SVG vẽ theo đó)
export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
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

// Tải dữ liệu dashboard; đổi woLine / khoảng ngày / reloadKey là tải lại. Chưa có woLine thì chưa tải.
export function useDashboardData({ woLine, dateFrom, dateTo, reloadKey }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!woLine) return undefined;
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fetchDashboard({ woLine, dateFrom, dateTo })
      .then(data => alive && setState({ data, loading: false, error: null }))
      .catch(error => alive && setState({ data: null, loading: false, error }));
    return () => { alive = false; };
  }, [woLine, dateFrom, dateTo, reloadKey]);
  return state;
}

// Chế độ "Xem toàn bộ": tự chỉnh zoom của cả trang để toàn bộ Kanban vừa đúng chiều cao màn hình, không phải cuộn.
// Zoom đổi thì bố cục giãn ra theo chiều ngang và chiều cao đổi theo, nên tính lặp vài lần cho tới khi ổn định.
// Theo dõi kích thước nội dung (mở thanh lọc, đổi ca, dữ liệu mới...) và kích thước cửa sổ để tính lại.
const FIT_MIN = 0.3, FIT_MAX = 1.4;

export function useFitToScreen(ref, enabled) {
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || !enabled) return undefined;
    root.classList.add("wd-fit");

    let busy = false;
    const fit = () => {
      if (busy) return;
      busy = true;
      let z = Number(el.style.zoom) || 1;
      for (let i = 0; i < 6; i++) {
        el.style.zoom = String(z);
        const next = Math.min(FIT_MAX, Math.max(FIT_MIN, (window.innerHeight / el.scrollHeight) * 0.995));
        if (Math.abs(next - z) < 0.004) break;
        z = next;
      }
      el.style.zoom = String(z);
      requestAnimationFrame(() => { busy = false; });
    };

    fit();
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      el.style.zoom = "";
      root.classList.remove("wd-fit");
    };
  }, [ref, enabled]);
}

// Đóng menu khi bấm ra ngoài
export function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [ref, onOutside]);
}
