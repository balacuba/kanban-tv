// Giả lập axios cho môi trường thử: trả lời 4 API mà màn HourlyOutputReport gọi, theo đúng dạng dữ liệu của màn cũ.
const STAGES = [
  { stage_name: "SMT-PCB-AOI-TOP", stage_key: "stage0" },
  { stage_name: "SMT-PCB-AOI-BOT", stage_key: "stage1" },
  { stage_name: "ICT", stage_key: "stage2" },
  { stage_name: "FCT", stage_key: "stage3" },
  { stage_name: "VMI", stage_key: "stage4" },
  { stage_name: "OQC", stage_key: "stage5" },
  { stage_name: "WH_IN", stage_key: "stage6" }
];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7];
const rnd = (seed: number) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

export const calls: string[] = [];
(window as any).__calls = calls;

function dailyReport(date: string) {
  const day = Number(date.slice(-2));
  const detailTable: any[] = [];
  const defectDetailTable: any[] = [];
  const completeQuantity: any[] = [];
  HOURS.forEach((h, k) => {
    const row: any = { testTime: `${h}:00-${(h + 1) % 24}:00` };
    let totalFail = 0;
    STAGES.forEach((s, j) => {
      const pass = Math.round(20 + 120 * rnd(day * 100 + k * 10 + j));
      const fail = rnd(day * 7 + k * 3 + j) > 0.8 ? Math.round(1 + 5 * rnd(k + j)) : 0;
      row[`${s.stage_key}_pass`] = pass;
      row[`${s.stage_key}_fail`] = fail;
      totalFail += fail;
    });
    detailTable.push(row);
    defectDetailTable.push({ testTime: row.testTime, totalFail });
    completeQuantity.push({ testTime: row.testTime, completeQuantity: row.stage6_pass });
  });
  // Dòng ngoài khung giờ như backend cũ trả về
  const outside: any = { testTime: "Ngoài khung giờ" };
  STAGES.forEach((s, j) => { outside[`${s.stage_key}_pass`] = j === 0 ? 5 : 0; outside[`${s.stage_key}_fail`] = j === 0 ? 1 : 0; });
  detailTable.push(outside);
  defectDetailTable.push({ testTime: "Ngoài khung giờ", totalFail: 1 });
  completeQuantity.push({ testTime: "Ngoài khung giờ", completeQuantity: 0 });
  const errorList = [
    { errorCode: "E01", errorCount: 18 }, { errorCode: "E02", errorCount: 12 }, { errorCode: "E03", errorCount: 8 },
    { errorCode: "E04", errorCount: 4 }, { errorCode: "E05", errorCount: 4 }, { errorCode: "E06", errorCount: 3 },
    { errorCode: "E06B", errorCount: 1 }, // khác mã nhưng cùng tên với E06 -> phải được gộp
    { errorCode: "E07", errorCount: 2 }, { errorCode: "E99", errorCount: 1 } // E99 không có tên -> hiện mã
  ];
  return { detailTable, defectDetailTable, completeQuantity, errorList };
}

const ERROR_CATALOG = [
  { errorCode: "E01", errorName: "Dựng linh kiện" }, { errorCode: "E02", errorName: "Hàn giả" },
  { errorCode: "E03", errorName: "Lệch linh kiện" }, { errorCode: "E04", errorName: "KENH LINH KIEN" },
  { errorCode: "E05", errorName: "Không kết nối" }, { errorCode: "E06", errorName: "Thiếu thiếc" },
  { errorCode: "E06B", errorName: "Thiếu thiếc " }, { errorCode: "E07", errorName: "Thieu linh kien" }
];

const reply = (data: any) => new Promise(resolve => setTimeout(() => resolve({ data, status: 200 }), 120));
const fail = (status: number, message: string) => new Promise((_, reject) => setTimeout(() =>
  reject({ response: { status, data: { result: { ok: false, message } } } }), 120));

function route(method: string, url: string) {
  calls.push(`${method} ${url}`);
  if (url.includes("/PlanningWorkOrder/search")) {
    return reply([{ woId: "11122610110-1" }, { woId: "11122610110-2" }, { woId: "WO-EMPTY" }]);
  }
  const common = /get-common-info\/([^?]+)/.exec(url);
  if (common) {
    const wo = decodeURIComponent(common[1]);
    if (wo === "WO-EMPTY") return reply({ result: { ok: false, message: "WO-Line chưa có dữ liệu" } });
    return reply({
      result: { ok: true },
      data: {
        productName: "PCB PCA BAM2510 NAPBOARD VER1.3 V35V35T1.6 BLACK",
        productCode: "1200400116",
        expectedQuantity: 4400,
        completedQuantity: 526,
        stageNameList: STAGES
      }
    });
  }
  const daily = /get-daily-report\?workOrderCode=([^&]+)&date=([\d-]+)/.exec(url);
  if (daily) return reply(dailyReport(daily[2]));
  if (url.includes("/api/errors")) {
    if (localStorage.getItem("mdmDown") === "1") return fail(500, "MDM down");
    return reply({ data: ERROR_CATALOG });
  }
  return fail(404, `Không có API giả cho ${url}`);
}

// Cùng chữ ký với axios thật: (url, [data], [config]) => Promise<{ data: any }>
const axios = {
  get: (url: string, ..._rest: any[]): Promise<{ data: any }> => route("GET", url) as Promise<{ data: any }>,
  post: (url: string, ..._rest: any[]): Promise<{ data: any }> => route("POST", url) as Promise<{ data: any }>
};
export default axios;
