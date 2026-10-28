// Chế độ thật (VITE_REAL=1): gọi qua proxy của Vite (/planning, /mdm) để trình duyệt không chặn CORS.
const real = (import.meta as any).env?.VITE_REAL === "1";
export const PLANNING_API_URL = real ? "/planning" : "http://planning.test";
export const MDM_URL = real ? "/mdm" : "http://mdm.test";
