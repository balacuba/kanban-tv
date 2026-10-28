import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Giữ nguyên đường dẫn thư mục dự án, không đổi sang đường dẫn thật khi thư mục bị Windows ảo hóa/chuyển hướng
  resolve: { preserveSymlinks: true },
  // Chuyển tiếp /api sang backend khi chạy dev; đổi target theo địa chỉ backend thật
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
