import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HourlyOutputReport } from "./app/report/HourlyOutputReport";

const REAL = (import.meta as any).env?.VITE_REAL === "1";

// Ô để người dùng tự dán token đăng nhập của ứng dụng (chỉ ở chế độ gọi API thật)
const TokenBox = () => {
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const has = !!localStorage.getItem("kanbanToken");
  // Chỉ nhận access token (typ "Bearer"); refresh_token / id_token sẽ bị server từ chối (401)
  const save = () => {
    const tok = value.trim().replace(/^["']|["']$/g, "").replace(/^bearer\s+/i, "");
    let typ = "";
    try {
      typ = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).typ || "";
    } catch { /* không đọc được */ }
    if (typ !== "Bearer") {
      setErr(typ
        ? `Đây là token loại "${typ}", không phải access token. Hãy copy chuỗi ở dòng authorization (sau chữ Bearer) hoặc trường "access_token".`
        : "Chuỗi vừa dán không phải token hợp lệ (có thể bị cắt ngắn).");
      return;
    }
    localStorage.setItem("kanbanToken", tok);
    location.reload();
  };
  if (has) {
    return (
      <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        Đã có token
        <button onClick={() => { localStorage.removeItem("kanbanToken"); location.reload(); }}>Xóa token</button>
      </span>
    );
  }
  // Chưa có token: khung lớn nổi bật ngay dưới thanh đầu trang
  return (
    <div style={{
      position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 1000, width: "min(640px, 92vw)",
      background: "#fff8e1", border: "3px solid #f0a020", borderRadius: 12, padding: 16, color: "#333",
      boxShadow: "0 8px 30px rgba(0,0,0,.25)", fontSize: 15
    }}>
      <b>Bước 1:</b> Dán token (đoạn sau chữ <code>Bearer </code>, bắt đầu bằng <code>eyJhbGci…</code>) vào ô dưới đây.<br />
      <b>Bước 2:</b> Bấm nút <b>Lưu token</b>.
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input type="password" placeholder="Bấm vào đây rồi Ctrl+V để dán token" value={value} autoFocus
          onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }}
          style={{ flex: 1, height: 40, fontSize: 15, padding: "0 10px", border: "2px solid #f0a020", borderRadius: 8 }} />
        <button onClick={save} style={{ height: 40, padding: "0 18px", fontSize: 15, fontWeight: 700, background: "#e8894a", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}>
          Lưu token
        </button>
      </div>
      {err && <div style={{ marginTop: 10, color: "#c62828", fontWeight: 600 }}>{err}</div>}
    </div>
  );
};

// Trạng thái token tự động do server thử lấy (đọc từ harness/.env.token)
interface AutoToken { configured: boolean; ok: boolean; expiresAt: number; error: string; }

const useAutoToken = () => {
  const [st, setSt] = useState<AutoToken | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/__token-status").then(r => r.json()).then(j => { if (alive) setSt(j); }).catch(() => undefined);
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return st;
};

const AutoTokenBadge = ({ st }: { st: AutoToken }) => (
  <span style={{ marginLeft: "auto", fontSize: 13, padding: "4px 10px", borderRadius: 6, background: st.ok ? "#1d7a46" : "#c62828" }}>
    {st.ok
      ? `Token tự động · hết hạn ${new Date(st.expiresAt).toLocaleTimeString("vi-VN")} (tự gia hạn)`
      : `Token tự động lỗi: ${st.error || "đang lấy…"}`}
  </span>
);

// Khung giả của ứng dụng: thanh menu phía trên + vùng màn hình bên dưới (như trong Jmix)
const App = () => {
  const auto = useAutoToken();
  // Chưa biết trạng thái token thì chưa vẽ Kanban (tránh gọi API khi chưa có token)
  if (REAL && !auto) return null;
  const useAuto = REAL && !!auto && auto.configured;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ height: 48, flex: "none", background: "#001529", color: "#fff", display: "flex", alignItems: "center", padding: "0 16px" }}>
        {REAL ? "Jmix app header (giả lập) – API THẬT" : "Jmix app header (giả lập)"}
        {useAuto && <AutoTokenBadge st={auto as AutoToken} />}
        {REAL && !useAuto && <TokenBox />}
      </div>
      <div id="screen" style={{ flex: 1, overflow: "auto" }}>
        <HourlyOutputReport />
      </div>
    </div>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
