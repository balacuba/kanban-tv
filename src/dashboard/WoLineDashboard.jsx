import { useEffect, useMemo, useRef, useState } from "react";
import "./WoLineDashboard.css";
import { SHIFTS, SLOTS, productionDate, shiftRange, shiftSlots } from "./constants";
import { fetchWoLines, savePlanOutput } from "./api";
import { useCurrentShift, useDashboardData, useFitToScreen } from "./hooks";
import { buildRows, computeDefectRate, computePareto, computeShiftView, computeStageOutput } from "./selectors";
import { exportDashboardExcel } from "./exportExcel";
import { captureCharts } from "./chartImages";
import { FilterBar } from "./components/FilterBar";
import { KpiCards } from "./components/KpiCards";
import { InfoTables } from "./components/InfoTables";
import { ParetoChart } from "./components/ParetoChart";
import { HourChart } from "./components/HourChart";
import { StageTable } from "./components/StageTable";
import { useI18n } from "./i18n";

function DetailIcon({ children }) {
  return <span className="detail-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg></span>;
}

export function WoLineDashboard() {
  const { t, shiftText, locale } = useI18n();
  // ---------- Bộ lọc ----------
  const [woLines, setWoLines] = useState([]);
  const [woLine, setWoLine] = useState("");
  // Khoảng ngày đang chọn trên thanh lọc và khoảng ngày đã "Tìm kiếm" (dùng để tải dữ liệu)
  const [dates, setDates] = useState(() => ({ from: productionDate(), to: productionDate() }));
  const [query, setQuery] = useState(() => ({ woLine: "", dateFrom: productionDate(), dateTo: productionDate() }));
  const onDates = (a, b) => setDates(a <= b ? { from: a, to: b } : { from: b, to: a });
  const [reloadKey, setReloadKey] = useState(0);
  const [shiftMode, setShiftMode] = useState("auto"); // "auto" | "0" | "1"
  const [range, setRange] = useState(null);           // null = cả ca
  const [stageSel, setStageSel] = useState(null);     // null = tất cả công đoạn

  // Chế độ "Xem toàn bộ": thu/phóng cả trang cho vừa một màn hình (nhớ lựa chọn trên máy)
  const rootRef = useRef(null);
  // Mặc định BẬT trên màn hình máy tính (≥ 1024px) để mở ra là thấy toàn bộ Kanban; người dùng tắt thì nhớ lựa chọn
  const [fit, setFit] = useState(() => {
    let saved = null;
    try { saved = localStorage.getItem("kanban-fit"); } catch { /* bỏ qua */ }
    return saved === null ? window.innerWidth >= 1024 : saved === "1";
  });
  useFitToScreen(rootRef, fit);
  const onToggleFit = () => {
    const next = !fit;
    setFit(next);
    try { localStorage.setItem("kanban-fit", next ? "1" : "0"); } catch { /* bỏ qua */ }
    // Bật thì vào toàn màn hình (bỏ thanh trình duyệt), tắt thì thoát
    if (next) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  const autoShift = useCurrentShift();
  const shiftIndex = shiftMode === "auto" ? autoShift : +shiftMode;
  const shift = SHIFTS[shiftIndex];
  const st = shiftText(shift); // tên ca theo ngôn ngữ đang chọn

  useEffect(() => {
    fetchWoLines().then(list => {
      setWoLines(list);
      if (list.length) {
        setWoLine(list[0]);
        setQuery(q => ({ ...q, woLine: list[0] }));
      }
    });
  }, []);

  // Tự chuyển ca: khi đồng hồ qua mốc đổi ca, về khung giờ đầy đủ của ca mới và tải lại dữ liệu.
  // Nếu đang xem một ngày (từ ngày = đến ngày) thì chuyển sang ngày sản xuất hiện tại
  // (ca đêm sau 0:00 vẫn thuộc ngày hôm trước); đang xem nhiều ngày thì giữ nguyên khoảng ngày.
  const prevAutoShift = useRef(autoShift);
  useEffect(() => {
    if (prevAutoShift.current === autoShift) return;
    prevAutoShift.current = autoShift;
    if (shiftMode !== "auto") return;
    setRange(null);
    setQuery(q => {
      if (q.dateFrom !== q.dateTo) return q;
      const d = productionDate();
      setDates({ from: d, to: d });
      return { ...q, dateFrom: d, dateTo: d };
    });
    setReloadKey(k => k + 1);
  }, [autoShift, shiftMode]);

  // ---------- Dữ liệu ----------
  const { data, loading, error } = useDashboardData({ ...query, reloadKey });
  useEffect(() => setStageSel(null), [data]); // WO khác có thể có danh sách công đoạn khác

  const slotOptions = shiftSlots(shiftIndex);
  const from = range?.from ?? slotOptions[0];
  const to = range?.to ?? slotOptions.at(-1);
  const selected = useMemo(() => stageSel ?? (data?.stages ?? []).map((_, i) => i), [stageSel, data]);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);
  const view = useMemo(
    () => (data ? computeShiftView(data, rows, { shiftIndex, from, to, stages: selected }) : null),
    [data, rows, shiftIndex, from, to, selected]
  );
  // Pareto cả kỳ (cho KPI, tỷ lệ lỗi) và Pareto đang xem: lọc theo ô "Công đoạn" trên thanh tìm kiếm
  // (lấy các lỗi được phát hiện ở những công đoạn đang chọn)
  const paretoAll = useMemo(() => computePareto(data?.defects ?? []), [data]);
  const stageFiltered = !!data && selected.length !== data.stages.length;
  const paretoStage = stageFiltered ? selected.map(i => data.stages[i]).join(", ") : "";
  const paretoView = useMemo(
    () => (stageFiltered ? computePareto(data.defects, selected.map(i => data.stages[i])) : paretoAll),
    [stageFiltered, selected, paretoAll, data]
  );
  const pareto = paretoAll;
  const defectRate = data ? computeDefectRate(data, rows, pareto.total) : 0;

  const topStage = useMemo(() => {
    if (!view || !view.totalFail) return null;
    const j = view.failByStage.indexOf(Math.max(...view.failByStage));
    return { name: data.stages[selected[j]], fail: view.failByStage[j] };
  }, [view, data, selected]);

  // ---------- Xử lý thao tác ----------
  const onShiftMode = v => { setShiftMode(v); setRange(null); };
  const onRange = (f, t) => setRange(f <= t ? { from: f, to: t } : { from: t, to: f });
  const onSearch = () => { setQuery({ woLine, dateFrom: dates.from, dateTo: dates.to }); setReloadKey(k => k + 1); };
  const onReset = () => { setShiftMode("auto"); setRange(null); setStageSel(null); };

  const stageNames = selected.map(i => data?.stages[i]);

  // ---------- Kế hoạch sản lượng ca (PlanOutput) ----------
  // Nhập tay theo từng WO + ngày + ca; lưu tạm trên máy và gửi backend qua savePlanOutput().
  // Sản lượng thực tế ca = tổng Pass tại OutputGroup của PM Plan trong các khung giờ đang xem.
  const planKey = data ? `planOutput:${data.woCode}:${query.dateFrom}_${query.dateTo}:${shift.key}` : null;
  const [planOutput, setPlanOutput] = useState(0);
  useEffect(() => {
    if (!planKey) return;
    let saved = null;
    try { saved = localStorage.getItem(planKey); } catch { /* trình duyệt chặn localStorage */ }
    setPlanOutput(saved != null ? +saved : (data.pmPlan[0]?.planOutput ?? 0));
  }, [planKey, data]);
  const onPlanOutput = value => {
    setPlanOutput(value);
    try { localStorage.setItem(planKey, String(value)); } catch { /* bỏ qua */ }
    savePlanOutput({ woCode: data.woCode, dateFrom: query.dateFrom, dateTo: query.dateTo, shift: shift.key, planOutput: value })
      .catch(e => console.warn("Không lưu được PlanOutput:", e));
  };
  const shiftOutput = data && view ? computeStageOutput(data, rows, view.hrs, data.pmPlan[0]?.outputGroup) : 0;

  // Xuất Excel đúng phần đang xem (ca, khung giờ, công đoạn đang lọc) + Pareto cả ngày
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      // Chụp biểu đồ trên trang thành ảnh để chèn vào file Excel
      const charts = await captureCharts([
        { key: "pareto", title: t("xl.paretoChart") + (paretoStage ? t("xl.paretoChartStage", { s: paretoStage }) : "") },
        { key: "input", title: t("xl.inChart") },
        { key: "output", title: t("xl.outChart") },
        { key: "defect", title: t("xl.defChart") },
      ]);
      await exportDashboardExcel({
        data, view, pareto, paretoView, paretoStage, defectRate, topStage, stageNames, shift, planOutput, shiftOutput, charts,
        t, locale, st, shiftRangeText: shiftRange(shift, t("nextDay")), dateRange: { from: query.dateFrom, to: query.dateTo },
        fromLabel: SLOTS[from].split("-")[0], toLabel: SLOTS[to].split("-").at(-1),
      });
    } catch (e) {
      alert(t("app.exportErr", { m: e.message }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="wo-dash" ref={rootRef}>
      <FilterBar
        woLines={woLines} woLine={woLine} onWoLine={setWoLine} dates={dates} onDates={onDates}
        shiftMode={shiftMode} autoShift={autoShift} onShiftMode={onShiftMode}
        slotOptions={slotOptions} from={from} to={to} onRange={onRange}
        stages={data?.stages ?? []} selectedStages={selected} onStages={setStageSel}
        onSearch={onSearch} onReset={onReset}
        onExport={data && view ? onExport : null} exporting={exporting}
        fit={fit} onToggleFit={onToggleFit}
      />

      <main className={`wd-main${loading ? " is-loading" : ""}`}>
        {error && <div className="error-box">{t("app.loadErr", { m: error.message })}</div>}

        {!data ? (
          <div className="loading-box">{loading ? t("app.loading") : t("app.noData")}</div>
        ) : (
          <>
            <KpiCards
              totalDefects={pareto.total} defectRate={defectRate}
              shiftName={st.shift}
              topDefect={pareto.items[0]} topStage={topStage}
              woCode={data.woCode} product={data.products[0]}
            />

            <InfoTables products={data.products} pmPlan={data.pmPlan} shiftText={st}
              planOutput={planOutput} onPlanOutput={onPlanOutput} shiftOutput={shiftOutput} />

            <section className="card focus">
              <h2 className="card-title center defect-title">
                <span className="defect-title-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
                </span>
                {t("pareto.title")}
              </h2>
              <div className="card-body">
                {paretoView.items.length
                  ? <ParetoChart items={paretoView.items} mainCount={paretoView.mainCount} compact={fit} />
                  : <div className="loading-box">{t("pareto.none")}</div>}
                <div className="legend">
                  <span><i className="dot" />{t("legend.main")}</span>
                  <span>{t("legend.threshold")}</span>
                  {stageFiltered && <span>{t("legend.stage")} <b>{paretoStage}</b> · {t("legend.count", { a: paretoView.total, b: paretoAll.total })}</span>}
                  {paretoView.items.some(d => d.est) && <span>{t("legend.est")}</span>}
                </div>
              </div>
            </section>

            {/* Nhiều công đoạn (> 10): bảng chiếm hết chiều ngang, 3 biểu đồ chuyển xuống thành một hàng bên dưới */}
            <div className={`bottom-row${stageNames.length > 10 ? " wide" : ""}`}>
              <section className="detail-col">
                {/* Mỗi biểu đồ một tông màu trùng màu đường: viền trên, dải tiêu đề, biểu tượng */}
                <div className="card detail-card in">
                  <h2 className="card-title">
                    <span className="detail-title"><DetailIcon><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></DetailIcon>{t("detail.in")}</span>
                    <small>{t("detail.inSub")}</small>
                  </h2>
                  <div className="card-body">
                    <HourChart values={view.input} labels={view.labels} color="#3b6fd8" type="area" chartKey="input"
                      night={shift.key === "night"} />
                  </div>
                </div>
                <div className="card detail-card out">
                  <h2 className="card-title">
                    <span className="detail-title"><DetailIcon><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M4 3h16" /></DetailIcon>{t("detail.out")}</span>
                    <small>{t("detail.outSub")}</small>
                  </h2>
                  <div className="card-body">
                    <HourChart values={view.output} labels={view.labels} color="#19a979" type="area" chartKey="output"
                      night={shift.key === "night"} />
                  </div>
                </div>
                <div className="card detail-card def">
                  <h2 className="card-title">
                    <span className="detail-title"><DetailIcon><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></DetailIcon>{t("detail.def")}</span>
                    <small>{t("detail.defSub")}</small>
                  </h2>
                  <div className="card-body">
                    <HourChart values={view.failByHour} labels={view.labels} color="#d63b3b" type="line" chartKey="defect"
                      night={shift.key === "night"} />
                  </div>
                </div>
              </section>

              <StageTable stageNames={stageNames} rows={view.rows} totals={view.totals}
                totalLabel={t("stage.total", st)} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
