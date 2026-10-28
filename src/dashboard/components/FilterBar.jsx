import { useCallback, useRef, useState } from "react";
import { SHIFTS, SLOTS, shiftRange } from "../constants";
import { useClickOutside } from "../hooks";
import { LANGS, useI18n } from "../i18n";
import logo from "../../assets/mkvision-logo.png";

function StageMultiSelect({ stages, selected, onChange }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const n = selected.length;
  const summary = n === stages.length ? t("stages.allN", { n })
    : n === 0 ? t("stages.none") : n === 1 ? stages[selected[0]] : t("stages.n", { n });
  const all = n === stages.length;
  const toggle = i => onChange(selected.includes(i) ? selected.filter(x => x !== i) : [...selected, i].sort((a, b) => a - b));

  return (
    <div className="multi" ref={ref}>
      <button type="button" className={`multi-summary${open ? " open" : ""}`} onClick={() => setOpen(o => !o)}>
        {summary}
      </button>
      {open && (
        <div className="multi-menu">
          <label className="all">
            <input
              type="checkbox"
              checked={all}
              ref={el => { if (el) el.indeterminate = n > 0 && !all; }}
              onChange={e => onChange(e.target.checked ? stages.map((_, i) => i) : [])}
            />
            {t("stages.all")}
          </label>
          {stages.map((s, i) => (
            <label key={s}>
              <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} /> {s}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Nút chọn ngôn ngữ: VI / EN / 中文 nằm liền nhau, ngôn ngữ đang dùng được tô đậm
function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang")} title={t("lang")}>
      {LANGS.map(l => (
        <button key={l.key} type="button" className={l.key === lang ? "on" : undefined}
          aria-pressed={l.key === lang} title={l.name} onClick={() => setLang(l.key)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  woLines, woLine, onWoLine, dates, onDates,
  shiftMode, autoShift, onShiftMode, slotOptions, from, to, onRange,
  stages, selectedStages, onStages, onSearch, onReset, onExport, exporting, fit, onToggleFit,
}) {
  const { t } = useI18n();
  // Bộ lọc ẩn mặc định, bấm kính lúp mới hiện
  const [open, setOpen] = useState(false);
  return (
    <header className="wd-header">
      {/* Hàng trên: logo bên trái, tiêu đề ở giữa, ngôn ngữ + nút bên phải; hàng dưới: bộ lọc */}
      <div className="wd-topbar">
        <img className="brand-logo" src={logo} alt="MK Vision" />
        <h1 className="brand-name"><span className="brand-text">Kanban</span></h1>
        <div className="topbar-actions">
          <LangSwitch />
          {/* Xem toàn bộ: thu/phóng cả Kanban cho vừa một màn hình + toàn màn hình */}
          <button type="button" className={`search-toggle${fit ? " on" : ""}`} onClick={onToggleFit}
            aria-pressed={!!fit} title={fit ? t("fit.off") : t("fit.on")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {fit
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
          <button type="button" className={`search-toggle${open ? " on" : ""}`} onClick={() => setOpen(o => !o)}
            aria-expanded={open} aria-controls="wd-filters" title={open ? t("search.hide") : t("search.show")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>}
            </svg>
          </button>
        </div>
      </div>
      {open && <div className="filters" id="wd-filters">
        <div className="field">
          <label htmlFor="wd-wo">WO Line</label>
          <select id="wd-wo" value={woLine} onChange={e => onWoLine(e.target.value)}>
            {woLines.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wd-date">{t("f.date")}</label>
          {/* Lọc từ ngày → đến ngày; chọn ngược thì tự đảo lại */}
          <div className="range date-range">
            <input id="wd-date" type="date" value={dates.from} max={dates.to}
              onChange={e => e.target.value && onDates(e.target.value, dates.to)} aria-label={t("f.dateFrom")} />
            <span className="range-sep">→</span>
            <input type="date" value={dates.to} min={dates.from}
              onChange={e => e.target.value && onDates(dates.from, e.target.value)} aria-label={t("f.dateTo")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="wd-shift">{t("f.shift")}</label>
          <select id="wd-shift" className="shift-sel" value={shiftMode} onChange={e => onShiftMode(e.target.value)}>
            <option value="auto">{t("f.auto", { shift: t(`shift.${SHIFTS[autoShift].key}`) })}</option>
            {SHIFTS.map((s, si) => <option key={s.key} value={String(si)}>{t(`shift.${s.key}`)} ({shiftRange(s, t("nextDay"))})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wd-from">{t("f.hours")}</label>
          <div className="range">
            <select id="wd-from" value={from} onChange={e => onRange(+e.target.value, to)}>
              {slotOptions.map(i => <option key={i} value={i}>{SLOTS[i]}</option>)}
            </select>
            <span className="range-sep">→</span>
            <select value={to} onChange={e => onRange(from, +e.target.value)} aria-label={t("f.hoursTo")}>
              {slotOptions.map(i => <option key={i} value={i}>{SLOTS[i]}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t("f.stage")}</label>
          <StageMultiSelect stages={stages} selected={selectedStages} onChange={onStages} />
        </div>
        <div className="filter-actions">
          <button type="button" className="btn" onClick={onSearch}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            {t("btn.search")}
          </button>
          <button type="button" className="btn ghost" onClick={onReset} title={t("btn.resetTip")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
            {t("btn.reset")}
          </button>
          <button type="button" className="btn excel" onClick={onExport} disabled={!onExport || exporting}
            title={t("btn.exportTip")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></svg>
            {exporting ? t("btn.exporting") : t("btn.export")}
          </button>
        </div>
      </div>}
    </header>
  );
}
