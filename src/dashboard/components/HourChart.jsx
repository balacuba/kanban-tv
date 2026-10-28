import { useId } from "react";
import { niceMax } from "../format";
import { useElementSize } from "../hooks";
import { useI18n } from "../i18n";

// Đường cong mượt không vượt quá điểm dữ liệu (monotone cubic) — tránh đường cong vọt xuống dưới 0
function monotonePath(pts) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : "";
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

// Biểu đồ theo khung giờ:
//  "area" – đường cong mượt có vùng tô chuyển sắc + đường trung bình giờ có sản lượng
//  "line" – đường gấp khúc có vùng tô (dùng cho số lỗi)
//  "bar"  – cột
export function HourChart({ values, labels, color, type, night, chartKey }) {
  const gradId = useId().replace(/:/g, "");
  const { t } = useI18n();
  const [ref, { width: W, height: H }] = useElementSize();
  const L = 34, R = 10, T = 30, B = 26;
  const n = values.length, pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(0, ...values));
  const band = n ? pw / n : 0;
  const x = i => L + band * (i + 0.5);
  const y = v => T + ph - v / max * ph;
  // Số nhãn giờ theo độ rộng thật (~44px mỗi nhãn) để biểu đồ hẹp không bị chồng chữ
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 44))));
  // Nhãn cuối chỉ hiện khi cách nhãn đều đặn gần nhất đủ 40px (không chồng chữ)
  const showLast = n > 1 && ((n - 1) % step) * band >= 40;
  const bw = Math.min(24, band * 0.65);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const ready = W > 0 && H > 0;

  const running = values.filter(v => v > 0);
  const avg = running.length ? running.reduce((a, b) => a + b, 0) / running.length : 0;

  return (
    <div className="plot" ref={ref} data-chart={chartKey}>
      {ready && (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {night && <rect x={L} y={T} width={pw} height={ph} fill="#eef1f6" />}
          {[0, 1, 2, 3, 4].map(k => {
            const v = max / 4 * k;
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={k ? "#eceef1" : "#c3c7cd"} />
                <text x={L - 6} y={y(v) + 4} textAnchor="end">{+v.toFixed(1)}</text>
              </g>
            );
          })}
          {labels.map((h, i) => (i % step === 0 || (i === n - 1 && showLast)) && (
            <text key={h} x={x(i)} y={H - 8} textAnchor="middle">{h}</text>
          ))}

          {type === "bar" && values.map((v, i) => v > 0 && (
            <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx={3} fill={color} />
          ))}

          {type === "area" && n > 1 && (
            <>
              <path d={`${monotonePath(pts)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradId})`} />
              <path d={monotonePath(pts)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              {avg > 0 && (
                <g>
                  <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke={color} strokeOpacity={0.55} strokeDasharray="4 4" />
                  {/* Nhãn TB dạng thẻ màu của biểu đồ, chữ trắng; đặt ở đầu trái (đầu ca thường ít sản lượng) để không đè số liệu cuối ca */}
                  {(() => {
                    const label = `${t("chart.avg")} ${Math.round(avg)}`;
                    const w = label.length * 7.6 + 12;
                    const lx = L + 4;
                    const top = y(avg) - 22;
                    return (
                      <g>
                        <rect x={lx} y={top} width={w} height={18} rx={9} fill={color} />
                        <text x={lx + w / 2} y={top + 13.5} textAnchor="middle" className="avg">{label}</text>
                      </g>
                    );
                  })()}
                </g>
              )}
              {values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={v ? 4 : 2} fill="#fff" stroke={color} strokeWidth={v ? 2.5 : 1.5} />
              ))}
            </>
          )}

          {type === "line" && n > 0 && (
            <>
              <polygon points={`${x(0)},${y(0)} ${pts.map(p => p.join(",")).join(" ")} ${x(n - 1)},${y(0)}`} fill={color} fillOpacity={0.12} />
              <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
              {values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={v ? 4 : 2.5} fill={v ? color : "#fff"} stroke={color} strokeWidth={2} />
              ))}
            </>
          )}

          {values.map((v, i) => v > 0 && (
            <text key={"v" + i} x={x(i)} y={y(v) - 9} textAnchor="middle" className="val">{v}</text>
          ))}
          {!values.some(Boolean) && (
            <text x={L + pw / 2} y={T + ph / 2} textAnchor="middle">{t("chart.empty")}</text>
          )}
        </svg>
      )}
    </div>
  );
}
