import { useEffect, useState } from "react";
import { fmt, pct } from "../format";
import { useI18n } from "../i18n";

// Ô nhập PlanOutput: sửa thoải mái, chỉ lưu khi rời ô hoặc bấm Enter
function PlanInput({ value, onCommit }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  useEffect(() => setDraft(String(value ?? 0)), [value]);
  const commit = () => {
    const n = Math.max(0, Math.round(Number(draft.replace(/[^\d]/g, "")) || 0));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      className="plan-input" inputMode="numeric" value={draft} aria-label="PlanOutput"
      // Ô tự co giãn theo số ký tự đang nhập (tối thiểu 3 ký tự); thêm 1ch vì số in đậm rộng hơn 1ch, tránh mất đuôi số
      style={{ width: `calc(${Math.max(3, draft.length) + 1}ch + 26px)` }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setDraft(String(value)); }}
    />
  );
}

// Màu mức đạt: >= 100% xanh, >= 80% vàng, dưới 80% đỏ
const tone = r => (r >= 1 ? "good" : r >= 0.8 ? "warn" : "bad");

function TitleIcon({ children }) {
  return <span className="title-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg></span>;
}

export function InfoTables({ products, pmPlan, shiftText, planOutput, onPlanOutput, shiftOutput }) {
  const { t } = useI18n();
  const rate = planOutput ? shiftOutput / planOutput : 0;
  return (
    <section className="info-row">
      {/* Sản phẩm: tông xanh dương */}
      <div className="card info-card product">
        <h2 className="card-title">
          <span className="title-main">
            <TitleIcon><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></TitleIcon>
            {t("info.product")}
          </span>
        </h2>
        <div className="card-body">
          <table className="info-table">
            {/* Chỉ có một cột nên bỏ dòng tiêu đề; mã sản phẩm nằm giữa thẻ */}
            <tbody>
              {products.length ? products.map(p => (
                <tr key={p.name}>
                  <td className="product-name"><span className="product-badge">{p.name}</span></td>
                </tr>
              )) : <tr><td className="empty">{t("info.noData")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PM Plan: tông vàng cam; nhóm "Thông tin model" và nhóm "Sản lượng ca" tách bằng tiêu đề nhóm + nền */}
      <div className="card info-card plan">
        <h2 className="card-title">
          <span className="title-main">
            <TitleIcon><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4M16 2v4M4 10h16" /><path d="m9 15 2 2 4-4" /></TitleIcon>
            PM Plan
          </span>
        </h2>
        <div className="card-body">
          <table className="info-table">
            <thead>
              <tr className="group-row">
                <th colSpan={3} className="grp-model">{t("info.model")}</th>
                <th colSpan={3} className="grp-plan">{t("info.output", shiftText)}</th>
              </tr>
              <tr>
                <th className="grp-model">Model Name</th><th className="grp-model">InputGroup</th><th className="grp-model">OutputGroup</th>
                <th className="grp-plan">PlanOutput</th><th className="grp-plan">{t("info.actual")}</th><th className="grp-plan rate-col">{t("info.rate")}</th>
              </tr>
            </thead>
            <tbody>
              {pmPlan.length ? pmPlan.map((p, i) => (
                <tr key={p.model}>
                  <td className="strong">{p.model}</td>
                  <td><span className="chip">{p.inputGroup}</span></td>
                  <td><span className="chip">{p.outputGroup}</span></td>
                  {/* Hiện mới có một dòng PM Plan; PlanOutput và thực tế áp cho dòng đầu tiên */}
                  <td className="plan-cell">{i === 0 ? <PlanInput value={planOutput} onCommit={onPlanOutput} /> : p.planOutput}</td>
                  <td className="plan-cell num">{i === 0 ? fmt(shiftOutput) : "—"}</td>
                  <td className="plan-cell rate-col">
                    {i === 0 && (planOutput > 0 ? (
                      <div className={`rate ${tone(rate)}`}>
                        <div className="rate-track"><div className="rate-fill" style={{ width: pct(Math.min(rate, 1), 1, 1) }} /></div>
                        <b>{pct(rate, 1, 1)}</b>
                      </div>
                    ) : <span className="hint">{t("info.enterPlan")}</span>)}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">{t("app.noData")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
