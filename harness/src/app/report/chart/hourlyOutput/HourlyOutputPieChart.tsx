import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { MDM_URL } from "../../../../config";
import { ErrorParetoChart, Pareto } from "./ErrorParetoChart";
import { useI18n } from "./KanbanShared";

/**
 * Khối "Defect Distribution" của Kanban.
 * - useErrorNames: tải danh mục lỗi (MDM) để đổi mã lỗi -> tên lỗi; lỗi khác mã nhưng cùng tên sẽ được gộp ở buildPareto.
 * - toDefectList: đổi errorList của báo cáo ([{ errorCode, errorCount }]) thành [{ name, count }].
 * - Dữ liệu lỗi lọc theo công đoạn / ca / khung giờ lấy từ ProductSerialNumberTestHistory (xem HourlyOutputReport).
 * - HourlyOutputPieChart: thẻ tiêu đề + biểu đồ Pareto + chú thích.
 */

export function useErrorNames(authToken?: string) {
  const { t } = useI18n();
  const [errorNames, setErrorNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setErrorNames(new Map());
    if (!authToken) return undefined;

    axios.post(`${MDM_URL}/api/errors`, {
      pageNumber: 0,
      pageSize: 0,
      common: "",
      filter: {},
      sortOrder: "DESC",
      sortProperty: "createdAt"
    }, {
      headers: { Authorization: `Bearer ${authToken}` },
      timeout: 20000
    }).then(response => {
      if (cancelled) return;
      if (!Array.isArray(response.data?.data)) {
        throw new Error("Invalid error catalog response");
      }
      const names = new Map<string, string>();
      response.data.data.forEach((item: any) => {
        const name = item.errorName?.trim();
        if (item.errorCode && name && !names.has(item.errorCode)) {
          names.set(item.errorCode, name);
        }
      });
      setErrorNames(names);
    }).catch(() => {
      if (!cancelled) toast.error(t("msg.errorNames"));
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  return errorNames;
}

export const toDefectList = (errorList: any[], names: Map<string, string>) =>
  (Array.isArray(errorList) ? errorList : []).map(item => {
    const code = String(item?.errorCode ?? "");
    return { name: names.get(code) || code, count: Number(item?.errorCount) || 0 };
  });

interface HourlyOutputPieChartProps {
  pareto: Pareto;
  expectedQuantity?: number;
  compact?: boolean;
  /** Cảnh báo khi không lọc được (vd. không tải được lỗi theo công đoạn / giờ) */
  note?: string;
  /** Số lượng OK (Pass) trong cùng phạm vi: % dưới mỗi cột = số lỗi / (OK + tổng lỗi) */
  okQty: number;
}

export const HourlyOutputPieChart = ({ pareto, expectedQuantity = 0, compact = false, note, okQty }: HourlyOutputPieChartProps) => {
  const { t } = useI18n();
  const rateBase = okQty + pareto.total;
  return (
    <section className="card focus">
      <h2 className="card-title center defect-title">
        <span className="defect-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
        </span>
        {t("pareto.title")}
      </h2>
      <div className="card-body">
        {pareto.items.length
          ? <ErrorParetoChart items={pareto.items} mainCount={pareto.mainCount} compact={compact}
            expectedQuantity={expectedQuantity} rateBase={rateBase} />
          : <div className="loading-box">{t("pareto.none")}</div>}
        {/* Không có dòng chú thích; chỉ hiện cảnh báo khi không tải được lỗi theo công đoạn / giờ */}
        {note && <div className="legend"><span className="note">{note}</span></div>}
      </div>
    </section>
  );
};

export default HourlyOutputPieChart;
