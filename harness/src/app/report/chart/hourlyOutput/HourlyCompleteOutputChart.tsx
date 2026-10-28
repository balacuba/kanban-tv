import React from "react";
import { DetailCard, HourChart, useI18n } from "./KanbanShared";

/**
 * Output Detail: số lượng hoàn thành theo giờ (completeQuantity của báo cáo),
 * đường cong xanh lá có vùng tô và đường trung bình các giờ có sản lượng.
 */
interface Props {
  values: number[];
  labels: string[];
  night?: boolean;
}

const HourlyCompleteOutputChart = ({ values, labels, night }: Props) => {
  const { t } = useI18n();
  return (
    <DetailCard
      tone="out"
      icon={<><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M4 3h16" /></>}
      title={t("detail.out")}
      sub={t("detail.outSub")}
    >
      <HourChart values={values} labels={labels} color="#19a979" type="area" chartKey="output" night={night} />
    </DetailCard>
  );
};

export default HourlyCompleteOutputChart;
