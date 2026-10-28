import React, { useState } from "react";
import { pct, sum, useElementSize, useI18n, wrapWords } from "./KanbanShared";

/**
 * Biểu đồ Pareto lỗi (SVG thuần), theo mẫu "Pareto lỗi AOI": cột số lỗi và đường % tích lũy vẽ chung một khung;
 * mỗi cột một màu; trục trái = số lỗi (0 → tổng lỗi), trục phải = % tích lũy 0–100% (bước 10%), hai trục thẳng hàng nên
 * mỗi điểm đọc được cả số lỗi cộng dồn lẫn % tích lũy; số lỗi ghi trong cột, tỷ lệ lỗi = số lỗi / (OK + lỗi) ghi dưới
 * chân cột, % tích lũy (1 chữ số lẻ)
 * ghi trên mỗi điểm; tên lỗi dưới cột; chú thích ở dưới cùng. Tỷ lệ lỗi / tỷ lệ lỗi cộng dồn hiện khi rê chuột.
 *   const pareto = buildPareto([{ name, count }]);
 *   <ErrorParetoChart items={pareto.items} rateBase={okQty + pareto.total} />
 */

// Màu cột theo hạng lỗi; màu cam để cuối vì trùng màu đường % tích lũy
const PALETTE = ["#3b6fd8", "#19a979", "#7b5bd6", "#1fa5c4", "#d64f8a", "#2f8f3a", "#d64545",
  "#b5b84a", "#c77fd6", "#7f8a96", "#c9a07a", "#e8a13b", "#e8743b"];
const THRESHOLD = 0.8;  // nhóm lỗi chính: cộng dồn tới 80% (đánh dấu trong Excel)
const BAR = "#2e75b6";  // màu nền khi rê chuột vào cột
const LINE = "#ed7d31"; // màu đường % tích lũy (như mẫu)
// Viền trắng quanh chữ: đường / cột đi qua không cắt ngang chữ
const HALO: React.CSSProperties = { paintOrder: "stroke", stroke: "#fff", strokeWidth: 4, strokeLinejoin: "round" };
// Tỷ lệ lỗi dưới chân cột: chữ đỏ đậm, nhỏ hơn số lỗi
const RATE: React.CSSProperties = { fontSize: 12, fontWeight: 700, fill: "#b3261e" };

export interface DefectInput { name: string; count: number; }
export interface ParetoItem extends DefectInput {
  color: string;  // màu cột của loại lỗi (mỗi cột một màu)
  ring: string;   // màu đỏ nhạt dần theo hạng
  share: number;  // tỷ lệ trên tổng lỗi (0–1)
  cum: number;    // tích lũy (0–1)
  main: boolean;  // thuộc nhóm lỗi chính
}
export interface Pareto { items: ParetoItem[]; total: number; mainCount: number; }

// Màu đỏ nhạt dần theo hạng lỗi: lỗi nhiều nhất đỏ đậm, lỗi cuối hồng nhạt
const redShade = (i: number, n: number) => {
  const k = n > 1 ? i / (n - 1) : 0;
  return `hsl(${Math.round(358 + 6 * k) % 360}, ${Math.round(72 - 8 * k)}%, ${Math.round(38 + 44 * k)}%)`;
};

// Gộp lỗi trùng tên, sắp giảm dần, tính tỷ lệ, tích lũy và nhóm lỗi chính
export function buildPareto(list: DefectInput[]): Pareto {
  const merged = new Map<string, number>();
  list.forEach(d => {
    const name = String(d.name || "").trim() || "(?)";
    if (d.count > 0) merged.set(name, (merged.get(name) || 0) + d.count);
  });
  const sorted = Array.from(merged, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const total = sum(sorted.map(d => d.count));
  // % từng lỗi = số lỗi / tổng lỗi; % tích lũy = số lỗi cộng dồn / tổng lỗi (cả hai tính chính xác rồi mới làm tròn,
  // nên cộng tay các % đã làm tròn trên cột có thể lệch số trên đường tối đa 0.1%)
  let cum = 0;
  const items = sorted.map((d, i) => {
    const before = cum;
    cum += d.count;
    return {
      ...d,
      color: PALETTE[i % PALETTE.length],
      ring: redShade(i, sorted.length),
      share: total ? d.count / total : 0,
      cum: total ? cum / total : 0,
      main: total ? before / total < THRESHOLD : false
    };
  });
  return { items, total, mainCount: items.filter(d => d.main).length };
}

interface ErrorParetoChartProps {
  items: ParetoItem[];
  /** Không còn tô nền nhóm lỗi chính trên biểu đồ (giữ để không đổi chỗ gọi; Excel vẫn đánh dấu nhóm lỗi chính) */
  mainCount?: number;
  /** Bản thấp hơn cho chế độ "Xem toàn bộ" */
  compact?: boolean;
  /** Sản lượng dự kiến: hiện thêm tỷ lệ lỗi trên sản lượng khi rê chuột */
  expectedQuantity?: number;
  /** Mẫu số tỷ lệ lỗi = số lượng OK + số lượng lỗi: tỷ lệ lỗi và tỷ lệ lỗi cộng dồn hiện khi rê chuột */
  rateBase?: number;
}

// Trục số lỗi: đỉnh = tổng số lỗi, thẳng hàng với 100% của trục phải, để mỗi điểm trên đường đọc đúng ở cả hai trục
// (số lỗi cộng dồn ở trục trái = % tích lũy ở trục phải). Vạch chia tối đa ~6 khoảng, luôn có vạch tại tổng.
function countAxis(total: number) {
  const top = Math.max(1, total);
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  let step = steps[steps.length - 1];
  for (let i = 0; i < steps.length; i++) {
    if (top / steps[i] <= 6) { step = steps[i]; break; }
  }
  const ticks: number[] = [];
  for (let v = 0; v < top; v += step) ticks.push(v);
  // Vạch cuối sát tổng quá thì bỏ để số không dính nhau
  if (ticks.length > 1 && top - ticks[ticks.length - 1] < step * 0.6) ticks.pop();
  ticks.push(top);
  return { top, ticks };
}

const PCT_TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export const ErrorParetoChart = React.memo(({ items, compact = false, expectedQuantity = 0, rateBase = 0 }: ErrorParetoChartProps) => {
  const [ref, { width }] = useElementSize();
  const [hover, setHover] = useState(-1);
  const { t } = useI18n();
  const n = items.length;

  const { top, ticks } = countAxis(sum(items.map(d => d.count)));
  const textW = (s: string) => s.split("").reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13.5 : 7.2), 0);
  // Lề trái: tiêu đề trục (xoay dọc) + số trục; lề phải: số % + tiêu đề trục
  const L = 22 + Math.ceil(textW(String(top))) + 10;
  const R = 22 + Math.ceil(textW("100%")) + 10;
  const W = width;
  const PT = 26, PH = compact ? 168 : 230;   // khung vẽ chung cột + đường
  const base = PT + PH;
  const col = n ? (W - L - R) / n : 0;
  const names = items.map(d => wrapWords(d.name, Math.max(6, Math.floor(col / 7))));
  const RT = base + 16;                       // hàng tỷ lệ lỗi dưới chân cột
  const NT = base + 34;                       // dòng đầu tên lỗi
  const LG = NT + 15 * Math.max(1, ...names.map(l => l.length)) + 14; // chú thích
  const H = LG + 14;
  const x = (i: number) => L + col * (i + 0.5);
  const yPct = (p: number) => base - p * PH;
  const barH = (c: number) => Math.max((c / top) * PH, 2);
  // Số lỗi: giữa cột (cột đủ cao), không thì trên cột. Cột đầu luôn có điểm % ở đúng mép trên nên không ghi ở mép.
  const countY = (c: number) => (barH(c) >= 24 ? base - barH(c) / 2 + 5 : base - barH(c) - 6);
  const bw = Math.min(64, col * 0.7);
  const pts = items.map((d, i) => [x(i), yPct(d.cum)]);
  // Tỷ lệ lỗi cộng dồn (rê chuột): số lỗi cộng dồn / (OK + lỗi)
  let running = 0;
  const cumRates = items.map(d => { running += d.count; return rateBase ? running / rateBase : 0; });

  return (
    <div className="pareto-scroll">
      <div className="plot pareto-plot" ref={ref} style={{ minWidth: n * 46 + L + R }} data-chart="pareto">
        {W > 0 && n > 0 && (
          <svg viewBox={`0 0 ${W} ${H}`} height={H}>
            {hover >= 0 && (
              <rect x={L + col * hover} y={PT - 20} width={col} height={NT - PT + 20 + 15 * names[hover].length}
                rx={6} fill={BAR} fillOpacity={0.07} />
            )}

            {/* Trục trái: số lỗi; trục phải: % tích lũy 0–100% */}
            <text transform={`translate(13 ${PT + PH / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">{t("pareto.count")}</text>
            <text transform={`translate(${W - 9} ${PT + PH / 2}) rotate(90)`} textAnchor="middle" className="axis-title">% {t("pareto.cum")}</text>
            {ticks.map(v => (
              <text key={"c" + v} x={L - 8} y={base - (v / top) * PH + 4} textAnchor="end" className="tick">{v}</text>
            ))}
            {PCT_TICKS.map(p => (
              <text key={"p" + p} x={W - R + 8} y={yPct(p) + 4} className="tick">{Math.round(p * 100)}%</text>
            ))}
            <line x1={L} x2={L} y1={PT} y2={base} stroke="#c9ced6" />
            <line x1={W - R} x2={W - R} y1={PT} y2={base} stroke="#c9ced6" />
            <line x1={L} x2={W - R} y1={base} y2={base} stroke="#8a9099" />

            {/* Cột số lỗi; số lỗi ghi trong cột (cột thấp thì ghi trên cột).
                Dưới chân cột: tỷ lệ lỗi = số lỗi / (OK + lỗi) (không có số OK thì % trên tổng lỗi) */}
            {items.map((d, i) => {
              const h = barH(d.count);
              const inside = h >= 24;
              // Cột thấp mà điểm % tích lũy nằm ngay trên cột: ghi số lỗi sang bên trái cột
              const aside = !inside && Math.abs(countY(d.count) - yPct(d.cum)) < 14;
              return (
                <g key={"b" + d.name + i}>
                  <rect x={x(i) - bw / 2} y={base - h} width={bw} height={h} fill={d.color} />
                  <text x={aside ? x(i) - bw / 2 - 5 : x(i)} y={aside ? base - 4 : countY(d.count)}
                    textAnchor={aside ? "end" : "middle"} className="count"
                    style={inside ? { fill: "#fff" } : HALO}>{d.count}</text>
                  <text x={x(i)} y={RT} textAnchor="middle" className="count" style={RATE}>
                    {/* Tỷ lệ lỗi thường < 1% nên ghi 2 chữ số lẻ (như cột tỷ lệ lỗi trong Excel) */}
                    {rateBase ? pct(d.count, rateBase, 2) : pct(d.share, 1, 1)}
                  </text>
                </g>
              );
            })}

            {/* Đường % tích lũy (bắt đầu từ lỗi đầu tiên) + % trên mỗi điểm */}
            <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke={LINE} strokeWidth={3}
              strokeLinejoin="round" strokeLinecap="round" />
            {items.map((d, i) => {
              let labelY = yPct(d.cum) - 11;
              // % trùng chỗ số lỗi của cùng cột thì đưa xuống dưới điểm
              if (Math.abs(labelY - countY(d.count)) < 16) labelY = yPct(d.cum) + 21;
              // Nhãn nằm trong cột: chữ trắng, viền cùng màu cột (viền trắng trên nền cột trông lem)
              const inBar = labelY - 11 > base - barH(d.count) && labelY < base;
              const style = inBar ? { ...HALO, stroke: d.color, fill: "#fff" } : HALO;
              return (
                <g key={"p" + d.name + i}>
                  <circle cx={x(i)} cy={yPct(d.cum)} r={5} fill={LINE} stroke="#fff" strokeWidth={1.5} />
                  <text x={x(i)} y={labelY} textAnchor="middle" className="count" style={style}>{pct(d.cum, 1, 1)}</text>
                </g>
              );
            })}

            {/* Tên lỗi dưới mỗi cột */}
            {items.map((d, i) => (
              <text key={"n" + d.name + i} x={x(i)} y={NT} textAnchor="middle" className="name">
                {names[i].map((ln, k) => (
                  <tspan key={k} x={x(i)} dy={k ? 15 : 0}>{ln}</tspan>
                ))}
              </text>
            ))}

            {/* Chú thích */}
            <g transform={`translate(${W / 2} ${LG})`}>
              {/* Ô màu chú thích ghép 3 màu đầu của các cột */}
              {[0, 1, 2].map(k => <rect key={k} x={-150 + k * 4} y={-9} width={4} height={12} fill={PALETTE[k]} />)}
              <text x={-132} y={2} className="name">{t("pareto.count")}</text>
              <line x1={10} x2={36} y1={-3} y2={-3} stroke={LINE} strokeWidth={3} />
              <circle cx={23} cy={-3} r={4} fill={LINE} />
              <text x={44} y={2} className="name">% {t("pareto.cum")}</text>
            </g>

            {/* Vùng rê chuột phủ trên cùng: làm sáng cột và hiện tooltip */}
            {items.map((d, i) => (
              <rect key={"hit" + i} x={L + col * i} y={0} width={col} height={LG - 16} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                <title>
                  {t("pareto.tip", { i: i + 1, name: d.name, n: d.count, p: pct(d.share, 1, 1), c: pct(d.cum, 1, 1) })
                    + (rateBase ? t("pareto.tipRate", { r: pct(d.count, rateBase, 2), cr: pct(cumRates[i], 1, 2) }) : "")
                    + (expectedQuantity > 0 ? t("pareto.tipQty", { q: pct(d.count, expectedQuantity, 2) }) : "")}
                </title>
              </rect>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
});

export default ErrorParetoChart;
