import React from "react";
import { DetailCard, HourChart, useI18n } from "./KanbanShared";

/**
 * Defect Detail: số lỗi theo giờ (totalFail của báo cáo; khi lọc công đoạn thì cộng Fail các công đoạn đang chọn),
 * đường gấp khúc đỏ có vùng tô.
 */
interface Props {
  values: number[];
  labels: string[];
  night?: boolean;
}

const HourlyFailOutputChart = ({ values, labels, night }: Props) => {
  const { t } = useI18n();
  return (
    <DetailCard
      tone="def"
      icon={<><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>}
      title={t("detail.def")}
      sub={t("detail.defSub")}
    >
      <HourChart values={values} labels={labels} color="#d63b3b" type="line" chartKey="defect" night={night} />
    </DetailCard>
  );
};

export default HourlyFailOutputChart;
