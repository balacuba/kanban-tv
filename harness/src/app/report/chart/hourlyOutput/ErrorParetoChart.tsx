import React, { useState } from "react";
import { pct, sum, useElementSize, useI18n, wrapWords } from "./KanbanShared";

/**
 * Biểu đồ Pareto lỗi nằm ngang (SVG thuần): mỗi loại lỗi một cột;
 * trên là đường tích lũy (trục 0–100% trên tổng lỗi, số ghi trên điểm = tỷ lệ lỗi cộng dồn), giữa là cột số lỗi,
 * dưới là hạng + tên lỗi. Nhóm lỗi chính (cộng dồn tới 80%) tô nền xanh.
 *   const pareto = buildPareto([{ name, count }]);
 *   <ErrorParetoChart items={pareto.items} mainCount={pareto.mainCount} />
 */

const PALETTE = ["#3b6fd8", "#e8743b", "#19a979", "#e8a13b", "#d64f8a", "#7b5bd6", "#1fa5c4",
  "#d64545", "#2f8f3a", "#c9a07a", "#b5b84a", "#c77fd6", "#7f8a96"];
const MAIN = "#1f4e9c";
const THRESHOLD = 0.8;
// Viền cùng màu nền quanh chữ: đường kẻ / đường gạch đi qua không cắt ngang chữ
const HALO: React.CSSProperties = { paintOrder: "stroke", stroke: "#fff", strokeWidth: 4, strokeLinejoin: "round" };

export interface DefectInput { name: string; count: number; }
export interface ParetoItem extends DefectInput {
  color: string;  // màu cột
  ring: string;   // màu vòng điểm trên đường tích lũy (đỏ nhạt dần theo hạng)
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
  mainCount: number;
  /** Bản thấp hơn cho chế độ "Xem toàn bộ" */
  compact?: boolean;
  /** Sản lượng dự kiến: hiện thêm tỷ lệ lỗi trên sản lượng khi rê chuột */
  expectedQuantity?: number;
  /** Mẫu số tỷ lệ lỗi = số lượng OK + số lượng lỗi; % dưới mỗi cột = số lỗi / mẫu số (0 = dùng % trên tổng lỗi) */
  rateBase?: number;
}

export const ErrorParetoChart = React.memo(({ items, mainCount, compact = false, expectedQuantity = 0, rateBase = 0 }: ErrorParetoChartProps) => {
  const [ref, { width }] = useElementSize();
  const [hover, setHover] = useState(-1);
  const { t } = useI18n();
  const n = items.length;

  // Lề trái nới theo nhãn trục dài nhất (vd. "Cumulative" tiếng Anh) để nhãn không chạm vùng biểu đồ
  const textW = (s: string) => s.split("").reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13.5 : 7.2), 0);
  // Đường tích lũy: vị trí điểm theo % cộng dồn trên tổng lỗi (trục 0–100%, mốc 80%).
  // Có mẫu số (OK + lỗi) thì số ghi trên điểm là tỷ lệ lỗi cộng dồn = số lỗi cộng dồn tới loại đó / (OK + lỗi),
  // điểm cuối = tỷ lệ lỗi của ca. Vì % trên tổng lỗi × tỷ lệ lỗi của ca = tỷ lệ lỗi cộng dồn, mỗi vạch trục ghi
  // thêm tỷ lệ lỗi tương ứng ("80% · 1.1%") để số trên điểm khớp với trục.
  const byRate = rateBase > 0;
  const cumRates: number[] = [];
  items.forEach((d, i) => cumRates.push((i ? cumRates[i - 1] : 0) + (byRate ? d.count / rateBase : 0)));
  const totalRate = cumRates.length ? cumRates[cumRates.length - 1] : 0;
  const rateDigits = totalRate < 0.01 ? 2 : 1;
  const cumLabel = (i: number) => (byRate ? pct(cumRates[i], 1, rateDigits) : pct(items[i].cum, 1));
  const tickLabel = (p: number) => `${p * 100}%` + (byRate && p > 0 ? ` · ${pct(totalRate * p, 1, rateDigits)}` : "");
  // Vạch 0 / 50 / 100% ghi ở trục trái; vạch 80% (đường gạch) ghi ở cuối đường bên phải để không dính nhãn 100%
  const TICKS = [0, 0.5, THRESHOLD, 1];
  const L = Math.max(52, Math.ceil(Math.max(
    ...["pareto.cum", "pareto.count", "pareto.type"].map(k => textW(t(k))),
    ...TICKS.filter(p => p !== THRESHOLD).map(p => textW(tickLabel(p)) * 0.95 + 8))) + 10);
  const W = width, R = 12;
  const CT = 32, CH = compact ? 104 : 130;             // dải tích lũy
  const BT = CT + CH + 52, BH = compact ? 64 : 110;    // dải cột số lỗi
  const NT = BT + BH + 14;                             // hạng + tên lỗi
  const col = n ? (W - L - R) / n : 0;
  // Tên lỗi ngắt dòng theo độ rộng cột; chiều cao biểu đồ nới theo tên dài nhất để không bị cắt chữ
  const names = items.map(d => wrapWords(d.name, Math.max(7, Math.floor(col / 6.5))));
  const H = NT + 38 + 15 * (Math.max(1, ...names.map(l => l.length)) - 1) + 12;
  const x = (i: number) => L + col * (i + 0.5);
  const yc = (p: number) => CT + CH - p * CH;
  const max = n ? items[0].count : 0;
  const bw = Math.min(40, col * 0.5);
  // Đường bắt đầu từ điểm của lỗi đầu tiên (không kéo từ gốc 0%)
  const pts = items.map((d, i) => [x(i), yc(d.cum)]);

  return (
    <div className="pareto-scroll">
      <div className="plot pareto-plot" ref={ref} style={{ minWidth: n * 46 + 56 }} data-chart="pareto">
        {W > 0 && n > 0 && (
          <svg viewBox={`0 0 ${W} ${H}`} height={H}>
            <rect x={L} y={4} width={col * mainCount} height={H - 8} rx={8} fill="#e6eefb" />
            {hover >= 0 && <rect x={L + col * hover} y={4} width={col} height={H - 8} rx={8} fill={MAIN} fillOpacity={0.08} />}

            <text x={0} y={12} className="axis-title">{t("pareto.cum")}</text>
            <text x={0} y={BT - 15} className="axis-title">{t("pareto.count")}</text>
            <text x={0} y={NT + 14} className="axis-title">{t("pareto.type")}</text>
            {TICKS.map(p => {
              const hot = p === THRESHOLD;
              return (
                <g key={p}>
                  <line x1={L} x2={W - R} y1={yc(p)} y2={yc(p)} stroke={hot ? "#8a9099" : "#dfe4ec"} strokeDasharray={hot ? "5 4" : undefined} />
                  {hot
                    ? <text x={W - R} y={yc(p) + 14} textAnchor="end" className="tick hot" style={HALO}>{tickLabel(p)}</text>
                    : <text x={L - 8} y={yc(p) + 4} textAnchor="end" className="tick">{tickLabel(p)}</text>}
                </g>
              );
            })}
            <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke="#3b6fd8" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

            {items.map((d, i) => {
              const main = i < mainCount, edge = i === mainCount - 1;
              const h = Math.max((d.count / max) * BH, 2);
              return (
                <g key={d.name + i}>
                  {/* Điểm tích lũy */}
                  <circle cx={x(i)} cy={yc(d.cum)} r={edge ? 7 : 5} fill="#fff" stroke={edge ? MAIN : d.ring} strokeWidth={edge ? 3 : 2.5} />
                  <text x={x(i)} y={yc(d.cum) - 12} textAnchor="middle" className={edge ? "hot" : undefined}
                    style={{ ...HALO, stroke: main ? "#e6eefb" : "#fff" }}>({cumLabel(i)})</text>
                  {/* Cột số lỗi */}
                  <rect x={x(i) - bw / 2} y={BT} width={bw} height={BH} fill="#eef0f3" />
                  <rect x={x(i) - bw / 2} y={BT + BH - h} width={bw} height={h} fill={d.color} />
                  <text x={x(i)} y={BT - 22} textAnchor="middle" className="count">{d.count}</text>
                  {/* Tỷ lệ lỗi = số lỗi / (OK + lỗi) */}
                  <text x={x(i)} y={BT - 8} textAnchor="middle">({rateBase ? pct(d.count, rateBase, 1) : pct(d.share, 1)})</text>
                  {/* Hạng + tên */}
                  {main && <circle cx={x(i)} cy={NT + 10} r={10} fill={MAIN} />}
                  <text x={x(i)} y={NT + 14} textAnchor="middle" className={main ? "rank on" : "rank"}>{i + 1}</text>
                  <text x={x(i)} y={NT + 38} textAnchor="middle" className="name">
                    {names[i].map((ln, k) => (
                      <tspan key={k} x={x(i)} dy={k ? 15 : 0}>{ln}</tspan>
                    ))}
                  </text>
                </g>
              );
            })}

            {/* Vùng rê chuột phủ trên cùng: làm sáng cột và hiện tooltip */}
            {items.map((d, i) => (
              <rect key={"hit" + i} x={L + col * i} y={0} width={col} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                <title>
                  {t("pareto.tip", { i: i + 1, name: d.name, n: d.count, p: pct(d.share, 1), c: pct(d.cum, 1) })
                    + (byRate ? t("pareto.tipRate", { r: pct(d.count, rateBase, 2), cr: pct(cumRates[i], 1, 2) }) : "")
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
