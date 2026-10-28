// Thay axios trong bản TV. Request được giao cho ứng dụng Android:
//   1. AndroidApi.prepare(id, method, url, body) – ứng dụng giữ lại phương thức, địa chỉ, nội dung gửi
//   2. fetch("/api/<id>") – ứng dụng gọi server thật (kèm token), trả kết quả về đúng như server trả
// Cách này tránh CORS và không đưa token vào trang web. Chạy thử trên máy tính (không có AndroidApi) thì gọi qua
// proxy /planning, /mdm của Vite.
type Res = { data: any; status: number };

const native: any = (window as any).AndroidApi;
let seq = 0;

function devUrl(url: string) {
  return url.replace(/^@planning/, "/planning").replace(/^@mdm/, "/mdm");
}

async function request(method: string, url: string, data?: any): Promise<Res> {
  const body = data === undefined ? "" : JSON.stringify(data);
  let res: Response;
  if (native) {
    const id = `${Date.now()}-${++seq}`;
    native.prepare(id, method, url, body);
    res = await fetch(`api/${id}`, { cache: "no-store" });
  } else {
    res = await fetch(devUrl(url), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body || undefined
    });
  }
  const text = await res.text();
  let json: any = text;
  try { json = text ? JSON.parse(text) : null; } catch { /* không phải JSON */ }
  if (res.status >= 200 && res.status < 300) return { data: json, status: res.status };
  // Cùng dạng lỗi với axios để code màn Kanban xử lý như cũ
  const err: any = new Error(`Request failed with status code ${res.status}`);
  err.response = { status: res.status, data: json };
  throw err;
}

const axios = {
  get: (url: string, _config?: any) => request("GET", url),
  post: (url: string, data?: any, _config?: any) => request("POST", url, data)
};
export default axios;
