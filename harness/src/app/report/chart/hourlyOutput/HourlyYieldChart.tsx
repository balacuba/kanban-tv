import React from "react";
import { DetailCard, niceMax, sum, useElementSize, useI18n } from "./KanbanShared";

/**
 * Tỷ lệ đạt theo giờ so với mục tiêu (mặc định 95%):
 * - Cột xanh dương: Input theo giờ (trục trái).
 * - Đường: tỷ lệ đạt = 1 − số lỗi / Input (trục phải, %); điểm xanh lá khi đạt mục tiêu, đỏ khi dưới mục tiêu.
 *   Giờ không có Input thì không có điểm. Tỷ lệ lỗi = số lỗi / Input (rê chuột để xem).
 * - Đường đứt nét: mục tiêu.
 */
export const YIELD_TARGET = 0.95;

interface Props {
  input: number[];
  fail: number[];
  labels: string[];
  night?: boolean;
  target?: number;
}

const BAR = "#9db8ec", OK = "#19a979", BAD = "#d63b3b", TARGET = "#e8833a";

const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

function YieldPlot({ input, fail, labels, night, target }: Required<Props>) {
  const { t } = useI18n();
  const [ref, { width: W, height: H }] = useElementSize();
  const L = 34, R = 40, T = 44, B = 26;
  const n = input.length, pw = W - L - R, ph = H - T - B;
  const band = n ? pw / n : 0;
  const x = (i: number) => L + band * (i + 0.5);
  const maxIn = niceMax(Math.max(0, ...input));
  const yIn = (v: number) => T + ph - (v / maxIn) * ph;
  const rate = input.map((v, i) => (v > 0 ? Math.max(0, 1 - fail[i] / v) : null));
  // Trục phải: từ mức thấp nhất (làm tròn xuống 10%, trong khoảng 50%–90%) đến 100% để thấy rõ chênh lệch quanh
  // mục tiêu; giờ có tỷ lệ thấp hơn đáy trục (vd. Input 1, lỗi 1 → 0%) vẽ ở đáy, nhãn vẫn ghi số thật
  const lowest = Math.min(target, ...rate.filter((r): r is number => r !== null));
  const minR = Math.max(0.5, Math.min(0.9, Math.floor(lowest * 10) / 10));
  const yR = (r: number) => T + ph - ((Math.max(r, minR) - minR) / (1 - minR)) * ph;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 44))));
  const showLast = n > 1 && ((n - 1) % step) * band >= 40;
  const bw = Math.min(24, band * 0.65);
  const ready = W > 0 && H > 0;

  // Đường nối các giờ có Input (giờ không có Input thì ngắt đoạn)
  const segs: number[][][] = [];
  rate.forEach((r, i) => {
    if (r === null) { segs.push([]); return; }
    if (!segs.length) segs.push([]);
    segs[segs.length - 1].push([x(i), yR(r)]);
  });

  const totalIn = sum(input), totalFail = sum(fail);
  const overall = totalIn ? Math.max(0, 1 - totalFail / totalIn) : null;
  const tgtLabel = `${t("yield.target")} ${Math.round(target * 100)}%`;
  const tgtW = tgtLabel.length * 7 + 12;

  return (
    <div className="plot" ref={ref} data-chart="yield">
      {ready && (
        <svg viewBox={`0 0 ${W} ${H}`}>
          {night && <rect x={L} y={T} width={pw} height={ph} fill="#eef1f6" />}
          {[0, 1, 2, 3, 4].map(k => {
            const v = (maxIn / 4) * k, r = minR + ((1 - minR) / 4) * k;
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={yIn(v)} y2={yIn(v)} stroke={k ? "#eceef1" : "#c3c7cd"} />
                <text x={L - 6} y={yIn(v) + 4} textAnchor="end">{+v.toFixed(1)}</text>
                <text x={W - R + 6} y={yR(r) + 4} textAnchor="start">{Math.round(r * 100)}%</text>
              </g>
            );
          })}
          {labels.map((h, i) => (i % step === 0 || (i === n - 1 && showLast)) && (
            <text key={h} x={x(i)} y={H - 8} textAnchor="middle">{h}</text>
          ))}

          {/* Cột Input */}
          {input.map((v, i) => v > 0 && (
            <rect key={i} x={x(i) - bw / 2} y={yIn(v)} width={bw} height={yIn(0) - yIn(v)} rx={3} fill={BAR}>
              <title>{`${labels[i]} · Input ${v}`}</title>
            </rect>
          ))}

          {/* Mục tiêu: đường đứt nét; chú thích ở hàng trên cùng để không đè lên các điểm */}
          <line x1={L} x2={W - R} y1={yR(target)} y2={yR(target)} stroke={TARGET} strokeWidth={1.5} strokeDasharray="6 4" />
          <rect x={L} y={6} width={tgtW} height={18} rx={9} fill={TARGET} />
          <text x={L + tgtW / 2} y={19.5} textAnchor="middle" className="avg">{tgtLabel}</text>

          {/* Tỷ lệ đạt */}
          {segs.filter(s => s.length > 1).map((s, k) => (
            <polyline key={k} points={s.map(p => p.join(",")).join(" ")} fill="none" stroke="#2f3a4a" strokeWidth={2}
              strokeLinejoin="round" />
          ))}
          {rate.map((r, i) => r !== null && (
            <g key={"r" + i}>
              <circle cx={x(i)} cy={yR(r)} r={4.5} fill={r >= target ? OK : BAD} stroke="#fff" strokeWidth={1.5}>
                <title>{t("yield.tip", { h: labels[i], i: input[i], f: fail[i], y: pctText(r), d: pctText(1 - r) })}</title>
              </circle>
              <text x={x(i)} y={yR(r) - 9} textAnchor="middle" className="val">{(r * 100).toFixed(1)}</text>
            </g>
          ))}

          {/* Tổng ca: tỷ lệ đạt chung */}
          {overall !== null && (
            <text x={W - R} y={19.5} textAnchor="end" className="val"
              fill={overall >= target ? OK : BAD} style={{ fill: overall >= target ? OK : BAD }}>
              {t("yield.overall", { y: pctText(overall), d: pctText(1 - overall) })}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

const HourlyYieldChart = ({ input, fail, labels, night = false, target = YIELD_TARGET }: Props) => {
  const { t } = useI18n();
  return (
    <DetailCard
      tone="yield"
      icon={<><path d="M3 20h18" /><path d="M6 16V9" /><path d="M11 16V5" /><path d="M16 16v-6" /><path d="m4 7 6-3 5 4 6-3" /></>}
      title={t("detail.yield")}
      sub={t("detail.yieldSub", { p: Math.round(target * 100) })}
    >
      <YieldPlot input={input} fail={fail} labels={labels} night={night} target={target} />
    </DetailCard>
  );
};

export default HourlyYieldChart;
