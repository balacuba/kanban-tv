export const fmt = n => (n ?? 0).toLocaleString("vi-VN");
export const pct = (a, b, d = 0) => (b ? (a / b * 100).toFixed(d) + "%" : "0%");
export const sum = arr => arr.reduce((a, b) => a + b, 0);

// Giá trị đỉnh trục Y "tròn" để chia 4 vạch đẹp
export function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const s of [1, 1.2, 1.6, 2, 4, 6, 8, 10]) if (s * p >= v) return s * p;
  return v;
}

// Ngắt tên dài thành nhiều dòng, mỗi dòng tối đa `max` ký tự
export function wrapWords(text, max) {
  const lines = [""];
  for (const w of text.split(" ")) {
    const cur = lines.at(-1);
    if (cur && (cur + " " + w).length > max) lines.push(w);
    else lines[lines.length - 1] = cur ? cur + " " + w : w;
  }
  return lines;
}
