// Giả lập các thư viện của ứng dụng Jmix trong môi trường thử.
// Token: chế độ thật lấy token người dùng tự dán vào ô trên thanh đầu trang (lưu ở localStorage của trang thử).
const storedToken = () => {
  // Bỏ dấu ngoặc kép / khoảng trắng / chữ "Bearer" thừa khi copy từ DevTools
  try { return (localStorage.getItem("kanbanToken") || "").trim().replace(/^["']|["']$/g, "").replace(/^bearer\s+/i, ""); } catch { return ""; }
};
export const useMainStore = () => ({ authToken: storedToken() || "test-token" });

export const registerScreen = (options: any) => {
  (window as any).__registered = options;
};

const toasts: string[][] = [];
(window as any).__toasts = toasts;
const push = (kind: string) => (msg: any) => { toasts.push([kind, String(msg)]); console.log(`[toast.${kind}]`, msg); };
export const toast = { error: push("error"), info: push("info"), success: push("success"), warn: push("warn") };
