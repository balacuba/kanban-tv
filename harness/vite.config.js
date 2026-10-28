import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const stub = p => fileURLToPath(new URL(`./stubs/${p}`, import.meta.url));

// Môi trường thử cho các file TSX xuất sang ứng dụng Jmix: thay thư viện của ứng dụng bằng bản giả.
// Chế độ API thật: đặt PLANNING_URL và MDM_URL (địa chỉ server) rồi chạy; axios thật gọi qua proxy /planning, /mdm.
const PLANNING_URL = process.env.PLANNING_URL;
const MDM_URL = process.env.MDM_URL;
const REAL = !!PLANNING_URL;

// Server chỉ nhận request đến từ địa chỉ của ứng dụng thật (CORS), nên proxy gửi kèm Origin của ứng dụng
const APP_ORIGIN = process.env.APP_ORIGIN || PLANNING_URL;

/* ---------- Token tự động ----------
   Tài khoản đọc từ file harness/.env.token (do người dùng tự tạo trên máy, không nằm trong code giao diện).
   Server thử tự lấy access token (Keycloak, grant_type=password), gia hạn trước khi hết hạn,
   và tự gắn "Authorization: Bearer ..." vào mọi request qua proxy. Trình duyệt không thấy mật khẩu lẫn token. */
const TOKEN_FILE = fileURLToPath(new URL("./.env.token", import.meta.url));
const auth = { token: "", expiresAt: 0, error: "", configured: false, timer: null };

function readTokenEnv() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const env = {};
  fs.readFileSync(TOKEN_FILE, "utf8").split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
  const need = ["KC_TOKEN_URL", "KC_CLIENT_ID", "KC_CLIENT_SECRET", "KC_USERNAME", "KC_PASSWORD"];
  return need.every(k => env[k]) ? env : null;
}

async function refreshToken() {
  clearTimeout(auth.timer);
  const env = readTokenEnv();
  auth.configured = !!env;
  if (!env) {
    auth.token = "";
    auth.error = fs.existsSync(TOKEN_FILE) ? "File .env.token còn thiếu thông tin" : "";
    return;
  }
  try {
    const res = await fetch(env.KC_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: env.KC_CLIENT_ID,
        client_secret: env.KC_CLIENT_SECRET,
        username: env.KC_USERNAME,
        password: env.KC_PASSWORD
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
    auth.token = body.access_token;
    auth.expiresAt = Date.now() + body.expires_in * 1000;
    auth.error = "";
    // Gia hạn trước khi hết hạn 60 giây (tối thiểu 30 giây một lần)
    auth.timer = setTimeout(refreshToken, Math.max(30, body.expires_in - 60) * 1000);
    console.log(`[token] Đã lấy token tự động, hết hạn lúc ${new Date(auth.expiresAt).toLocaleTimeString("vi-VN")}`);
  } catch (e) {
    auth.token = "";
    auth.error = String(e.message || e);
    auth.timer = setTimeout(refreshToken, 30000); // lỗi thì thử lại sau 30 giây
    console.log(`[token] Không lấy được token: ${auth.error}`);
  }
}

// Trạng thái cho trang thử (không trả về token hay mật khẩu)
const tokenStatus = (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ configured: auth.configured, ok: !!auth.token, expiresAt: auth.expiresAt, error: auth.error }));
};

const tokenPlugin = {
  name: "kanban-auto-token",
  // Chạy dev (vite)
  configureServer(server) {
    if (!REAL) return;
    refreshToken();
    // Tạo / sửa file .env.token là lấy lại token ngay, không cần khởi động lại
    server.watcher.add(TOKEN_FILE);
    server.watcher.on("all", (_ev, file) => { if (file === TOKEN_FILE) refreshToken(); });
    server.middlewares.use("/__token-status", tokenStatus);
  },
  // Chạy bản build (vite preview)
  configurePreviewServer(server) {
    if (!REAL) return;
    refreshToken();
    server.middlewares.use("/__token-status", tokenStatus);
  }
};

const proxyTo = (prefix, target) => ({
  target,
  changeOrigin: true,
  secure: false,
  headers: APP_ORIGIN ? { origin: APP_ORIGIN } : undefined,
  rewrite: p => p.replace(new RegExp(`^${prefix}`), ""),
  // Có token tự động thì thay header Authorization của trình duyệt bằng token đó
  configure: proxy => proxy.on("proxyReq", proxyReq => {
    if (auth.token) proxyReq.setHeader("authorization", `Bearer ${auth.token}`);
  })
});

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tokenPlugin],
  define: { "import.meta.env.VITE_REAL": JSON.stringify(REAL ? "1" : "0") },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@haulmont/jmix-react-core": stub("others.ts"),
      "@haulmont/jmix-react-ui": stub("others.ts"),
      "react-toastify": stub("others.ts"),
      ...(REAL ? {} : { axios: stub("axios.ts") })
    }
  },
  server: { port: 5174, strictPort: true, proxy: apiProxy() },
  // Bản build: vite build → harness/dist, chạy bằng vite preview (cổng 4174) với cùng proxy + token tự động
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  preview: { port: 4174, strictPort: true, proxy: apiProxy() }
});

function apiProxy() {
  return REAL
    ? {
      "/planning": proxyTo("/planning", PLANNING_URL),
      ...(MDM_URL ? { "/mdm": proxyTo("/mdm", MDM_URL) } : {})
    }
    : undefined;
}
