import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bản web của Kanban cho ứng dụng Android TV. Dùng chung các file TSX của màn HourlyOutputReport,
// chỉ thay thư viện Jmix / axios / config bằng bản cho TV. Kết quả build chép vào assets của ứng dụng Android.
const here = p => fileURLToPath(new URL(p, import.meta.url));
const OUT = process.env.TV_OUT || here("../android-tv/app/src/main/assets/web");
const HARNESS_CONFIG = path.normalize(here("../harness/src/config.ts"));

// Chạy thử trên máy tính (không có ứng dụng Android): gọi API qua proxy giống trang thử
const PLANNING_URL = process.env.PLANNING_URL;
const MDM_URL = process.env.MDM_URL;
const proxyTo = (prefix, target) => ({
  target, changeOrigin: true, secure: false, headers: { origin: PLANNING_URL },
  rewrite: p => p.replace(new RegExp(`^${prefix}`), "")
});

export default defineConfig({
  root: here("."),
  base: "./",
  plugins: [
    react(),
    {
      // "../../config" trong các file Kanban → config của bản TV
      name: "tv-config",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (!/config$/.test(source) || !importer) return null;
        const r = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (r && path.normalize(r.id) === HARNESS_CONFIG) return here("src/config.ts");
        return null;
      }
    }
  ],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@haulmont/jmix-react-core": here("src/jmix-stubs.ts"),
      "@haulmont/jmix-react-ui": here("src/jmix-stubs.ts"),
      "react-toastify": here("src/jmix-stubs.ts"),
      axios: here("src/bridge-axios.ts")
    }
  },
  // WebView trên TV có thể là bản Chromium cũ
  build: { outDir: OUT, emptyOutDir: true, sourcemap: false, target: ["es2015", "chrome61"], cssTarget: "chrome61" },
  server: {
    port: 5175, strictPort: true,
    proxy: PLANNING_URL ? { "/planning": proxyTo("/planning", PLANNING_URL), ...(MDM_URL ? { "/mdm": proxyTo("/mdm", MDM_URL) } : {}) } : undefined
  }
});
