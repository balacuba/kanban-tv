import { fmt } from "../format";
import { useI18n } from "../i18n";

// Mật độ bảng theo số công đoạn: ít thì rộng rãi, nhiều (tới ~20) thì thu nhỏ chữ/khoảng cách để vừa khung
export const stageDensity = n => (n <= 8 ? "normal" : n <= 14 ? "compact" : "dense");

// Pass và Fail chung một ô dạng "pass / fail": Pass đậm màu tối, Fail đỏ đậm khi có lỗi, nhạt khi 0
function Cells({ cells }) {
  return cells.map(([p, f], j) => (
    <td key={j} className={`pf${f > 0 ? " hit" : ""}`} title={`Pass ${fmt(p)} · Fail ${f}`}>
      <span className="pf-one">
        <span className="pv">{fmt(p)}</span>
        <span className="sep">/</span>
        <span className="fv">{f}</span>
      </span>
    </td>
  ));
}

export function StageTable({ stageNames, rows, totals, totalLabel }) {
  const { t } = useI18n();
  // Phần pass và phần fail rộng bằng nhau (theo số dài nhất cả bảng): đầu số thẳng cột, dấu "/" nằm chính giữa ô
  const all = [...rows.flatMap(r => r.cells), ...totals];
  const width = { "--nw": `${Math.max(1, ...all.map(([p, f]) => Math.max(fmt(p).length, String(f).length)))}ch` };
  return (
    <section className="card stage-card">
      <h2 className="card-title center defect-title blue">
        <span className="defect-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></svg>
        </span>
        {t("stage.title")}
      </h2>
      <div className="card-body stage-scroll">
        <table className={`stage-table ${stageDensity(stageNames.length)}`} style={width}>
          <thead>
            <tr>
              <th className="time">{t("stage.time")}</th>
              {stageNames.map(s => <th key={s} className="stage" title={s}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {!stageNames.length ? (
              <tr><td className="time" /><td className="empty">{t("stage.noneSel")}</td></tr>
            ) : (
              <>
                {rows.map(({ slot, cells }) => (
                  <tr key={slot} className={cells.every(([p, f]) => !p && !f) ? "idle" : undefined}>
                    <td className="time">{slot}</td>
                    <Cells cells={cells} />
                  </tr>
                ))}
                <tr className="total">
                  <td className="time">{totalLabel}</td>
                  <Cells cells={totals} />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
