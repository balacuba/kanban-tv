// Bản TV không chạy trong ứng dụng Jmix: thay các hàm của Jmix / react-toastify bằng bản nhỏ.
// Token do ứng dụng Android giữ và tự gắn vào request, nên giao diện chỉ cần một giá trị khác rỗng.
export const useMainStore = () => ({ authToken: "tv" });

export const registerScreen = (_options: any) => undefined;

// Thông báo nhỏ góc dưới màn hình (thay react-toastify)
const show = (kind: string) => (msg: any) => {
  const box = document.createElement("div");
  box.className = `tv-toast tv-toast-${kind}`;
  box.textContent = String(msg);
  let host = document.getElementById("tv-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "tv-toasts";
    document.body.appendChild(host);
  }
  host.appendChild(box);
  setTimeout(() => box.remove(), 6000);
};
export const toast = { error: show("error"), info: show("info"), success: show("success"), warn: show("warn") };
