import { fmt, pct } from "../format";
import { useI18n } from "../i18n";

const ICONS = {
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></>,
};

function KpiIcon({ name, tone }) {
  return (
    <span className={`kpi-icon ${tone}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>
    </span>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="hero-stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function KpiCards({ totalDefects, defectRate, shiftName, topDefect, topStage, woCode, product }) {
  const { t } = useI18n();
  const plan = product?.plan ?? 0, done = product?.done ?? 0;
  const donePct = plan ? done / plan : 0;
  return (
    <section className="kpis">
      <div className="card kpi hero">
        <Stat label={t("kpi.total")} value={fmt(totalDefects)} />
        <i className="hero-divider" />
        <Stat label={t("kpi.rate")} value={`${(defectRate * 100).toFixed(1)}%`} />
      </div>

      <div className="card kpi">
        <KpiIcon name="alert" tone="red" />
        <div className="kpi-body">
          <span className="label">{t("kpi.topDefect")}</span>
          <span className="value red" title={topDefect?.name}>{topDefect?.name ?? "—"}</span>
          {topDefect && <span className="sub">{t("kpi.topDefectSub", { n: topDefect.count, p: pct(topDefect.share, 1) })}</span>}
        </div>
      </div>

      <div className="card kpi">
        <KpiIcon name="layers" tone="amber" />
        <div className="kpi-body">
          <span className="label" title={t("kpi.topStage")}>{t("kpi.topStage")}</span>
          <span className="value red" title={topStage?.name}>{topStage ? topStage.name : t("kpi.noFail")}</span>
          {topStage && <span className="sub">{t("kpi.topStageSub", { n: topStage.fail, shift: shiftName })}</span>}
        </div>
      </div>

      <div className="card kpi">
        <KpiIcon name="tag" tone="blue" />
        <div className="kpi-body">
          <span className="label">{t("kpi.wo")}</span>
          <span className="value" title={woCode}>{woCode || "—"}</span>
        </div>
      </div>

      <div className="card kpi">
        <KpiIcon name="box" tone="green" />
        <div className="kpi-body">
          <span className="label" title={t("kpi.done")}>{t("kpi.done")}</span>
          <span className="value">{fmt(done)} <small>/ {fmt(plan)}</small></span>
          <div className="meter">
            <div className="meter-track"><div className="meter-fill" style={{ width: pct(Math.min(donePct, 1), 1, 1) }} /></div>
            <span className="meter-pct">{pct(donePct, 1, 1)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
