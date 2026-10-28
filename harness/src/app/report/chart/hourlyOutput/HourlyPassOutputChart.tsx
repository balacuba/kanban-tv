import React from "react";
import { DetailCard, HourChart, useI18n } from "./KanbanShared";

/**
 * Input Detail: số lượng đầu vào theo giờ (Pass của công đoạn đầu tiên – stage0_pass),
 * đường cong xanh dương có vùng tô và đường trung bình các giờ có sản lượng.
 */
interface Props {
  values: number[];   // giá trị theo từng khung giờ đang xem
  labels: string[];   // nhãn giờ ("8:00", "9:00", ...)
  night?: boolean;    // ca đêm: nền vùng biểu đồ xám nhạt
}

const HourlyPassOutputChart = ({ values, labels, night }: Props) => {
  const { t } = useI18n();
  return (
    <DetailCard
      tone="in"
      icon={<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>}
      title={t("detail.in")}
      sub={t("detail.inSub")}
    >
      <HourChart values={values} labels={labels} color="#3b6fd8" type="area" chartKey="input" night={night} />
    </DetailCard>
  );
};

export default HourlyPassOutputChart;
