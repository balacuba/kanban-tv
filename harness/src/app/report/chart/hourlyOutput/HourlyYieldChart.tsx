import React, { useState } from "react";
import { DetailCard, fmt, meetsTarget, sum, useElementSize, useI18n } from "./KanbanShared";
import { Period, PeriodSeries } from "./yieldPeriods";

/**
 * Tỷ lệ đạt so với mục tiêu (mặc định 95%), xem Theo ngày (mặc định) / Theo tháng / Theo năm / Theo giờ:
 * - Theo ngày / tháng / năm: tự lấy 30 ngày / 12 tháng / 3 năm gần nhất, cả 2 ca, theo các WO đang xem (không theo bộ lọc
 *   ngày / ca / khung giờ / công đoạn) — xem yieldPeriods.ts. Theo giờ: các khung giờ của ca đang xem (theo bộ lọc).
 * - Cột: tỷ lệ đạt = 1 − số lỗi / Input, cao theo trục % bên phải (0–100%); xanh lá khi ≥ mục tiêu, đỏ khi dưới.
 *   Trên đầu cột: tỷ lệ đạt; chân cột: Input. Không có Input thì không có cột. Rê chuột xem Input, lỗi, tỷ lệ lỗi.
 * - Đường đứt nét: mục tiêu.
 */
export const YIELD_TARGET = 0.95;

interface Series { input: number[]; fail: number[]; labels: string[]; }

type Mode = Period | "hour";
const MODES: Mode[] = ["day", "month", "year", "hour"];
const MODE_LABEL: Record<Mode, string> = { day: "yield.byDay", month: "yield.byMonth", year: "yield.byYear", hour: "yield.byHour" };

interface Props {
  byHour: Series;
  periods: Record<Period, PeriodSeries | null>;   // null = đang tải
  night?: boolean;
  target?: number;
}

const BAR_OK = "#8fd6b8", BAR_BAD = "#f2a7a3", TARGET = "#e8833a";

const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

function YieldPlot({ input, fail, labels, night, target }: Series & { night: boolean; target: number }) {
  const { t } = useI18n();
  const [ref, { width: W, height: H }] = useElementSize();
  const L = 14, R = 40, T = 44, B = 26;
  const n = input.length, pw = W - L - R, ph = H - T - B;
  const band = n ? pw / n : 0;
  const x = (i: number) => L + band * (i + 0.5);
  const rate = input.map((v, i) => (v > 0 ? Math.max(0, 1 - fail[i] / v) : null));
  // Đạt khi ≥ mục tiêu (so theo số đang hiển thị); dưới mục tiêu báo đỏ
  const bad = (i: number) => rate[i] !== null && !meetsTarget(rate[i] as number, target);
  // Cột cao theo tỷ lệ đạt, đọc trên trục phải cố định 0% – 100%
  const yR = (r: number) => T + ph - Math.max(0, Math.min(1, r)) * ph;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 44))));
  const showLast = n > 1 && ((n - 1) % step) * band >= 40;
  const bw = Math.min(40, band * 0.7);
  const ready = W > 0 && H > 0;

  const totalIn = sum(input), totalFail = sum(fail);
  const overall = totalIn ? Math.max(0, 1 - totalFail / totalIn) : null;
  const tgtLabel = `${t("yield.target")} ${Math.round(target * 100)}%`;
  const tgtW = tgtLabel.length * 7 + 12;
  const showVals = band >= 26;   // cột quá hẹp thì bỏ số (rê chuột vẫn xem được)

  return (
    <div className="plot" ref={ref} data-chart="yield">
      {ready && (
        <svg viewBox={`0 0 ${W} ${H}`}>
          {night && <rect x={L} y={T} width={pw} height={ph} fill="#eef1f6" />}
          {[0, 1, 2, 3, 4].map(k => {
            const r = k / 4;
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={yR(r)} y2={yR(r)} stroke={k ? "#eceef1" : "#c3c7cd"} />
                <text x={W - R + 6} y={yR(r) + 4} textAnchor="start">{r * 100}%</text>
              </g>
            );
          })}
          <text x={W - 4} y={T - 8} textAnchor="end" className="axis-cap">{t("xl.yield")}</text>
          {labels.map((h, i) => (i % step === 0 || (i === n - 1 && showLast)) && (
            <text key={h + i} x={x(i)} y={H - 8} textAnchor="middle">{h}</text>
          ))}

          {/* Cột = tỷ lệ đạt (đọc theo trục % bên phải): xanh lá khi ≥ mục tiêu, đỏ khi dưới; chân cột ghi Input */}
          {rate.map((r, i) => r !== null && (
            <g key={i}>
              <rect x={x(i) - bw / 2} y={yR(r)} width={bw} height={Math.max(1, yR(0) - yR(r))} rx={3}
                fill={bad(i) ? BAR_BAD : BAR_OK}>
                <title>{t("yield.tip", { h: labels[i], i: input[i], f: fail[i], y: pctText(r), d: pctText(1 - r) })}</title>
              </rect>
              {showVals && (
                <text x={x(i)} y={yR(r) - 6} textAnchor="middle" className={`val ${bad(i) ? "bad" : "good"}`}>
                  {(r * 100).toFixed(1)}
                </text>
              )}
              {showVals && yR(0) - yR(r) >= 18 && (
                <text x={x(i)} y={yR(0) - 6} textAnchor="middle" className="in-cnt">{fmt(input[i])}</text>
              )}
            </g>
          ))}

          {/* Mục tiêu: đường đứt nét; chú thích ở hàng trên cùng */}
          <line x1={L} x2={W - R} y1={yR(target)} y2={yR(target)} stroke={TARGET} strokeWidth={1.5} strokeDasharray="6 4" />
          <rect x={L} y={6} width={tgtW} height={18} rx={9} fill={TARGET} />
          <text x={L + tgtW / 2} y={19.5} textAnchor="middle" className="avg">{tgtLabel}</text>

          {/* Tỷ lệ đạt chung của phần đang xem */}
          {overall !== null && (
            <text x={W - R} y={19.5} textAnchor="end" className={`val ${meetsTarget(overall, target) ? "good" : "bad"}`}>
              {t("yield.overall", { y: pctText(overall), d: pctText(1 - overall) })}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

const MODE_KEY = "kanban-yield-mode";

const HourlyYieldChart = ({ byHour, periods, night = false, target = YIELD_TARGET }: Props) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>(() => {
    let m: string | null = null;
    try { m = localStorage.getItem(MODE_KEY); } catch { /* bỏ qua */ }
    return MODES.indexOf(m as Mode) >= 0 ? (m as Mode) : "day";
  });
  const pick = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* bỏ qua */ }
  };
  const data: Series | null = mode === "hour" ? byHour : periods[mode];
  const p = Math.round(target * 100);
  return (
    <DetailCard
      tone="yield"
      icon={<><path d="M3 20h18" /><path d="M6 16V9" /><path d="M11 16V5" /><path d="M16 16v-6" /><path d="m4 7 6-3 5 4 6-3" /></>}
      title={t("detail.yield")}
      sub={mode === "hour" ? t("detail.yieldSub", { p }) : t("yield.subPeriod", { n: t(`yield.n.${mode}`), p })}
      extra={(
        <span className="yield-mode" role="group">
          {MODES.map(m => (
            <button key={m} type="button" className={mode === m ? "on" : undefined} aria-pressed={mode === m}
              onClick={() => pick(m)}>{t(MODE_LABEL[m])}</button>
          ))}
        </span>
      )}
    >
      {data
        ? <YieldPlot input={data.input} fail={data.fail} labels={data.labels} night={mode === "hour" && night} target={target} />
        : <div className="plot"><div className="chart-empty">{t("yield.loading")}</div></div>}
    </DetailCard>
  );
};

export default HourlyYieldChart;
