// Chụp biểu đồ SVG đang hiển thị thành ảnh PNG để chèn vào Excel.
// Style của chữ/đường trong SVG nằm ở file CSS, nên phải chép style đã tính vào từng phần tử trước khi xuất,
// nếu không ảnh sẽ mất màu chữ, cỡ chữ.
const STYLE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "opacity", "font-family", "font-size", "font-weight", "letter-spacing", "text-anchor", "visibility",
];

export async function svgToPng(svg, scale = 2) {
  const clone = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute("style", STYLE_PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  });

  const vb = svg.viewBox.baseVal;
  const width = Math.round(vb?.width || svg.clientWidth);
  const height = Math.round(vb?.height || svg.clientHeight);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);

  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return { base64: canvas.toDataURL("image/png"), width, height };
}

// Lấy các biểu đồ đang có trên trang (đánh dấu bằng data-chart) theo thứ tự cho trước
export async function captureCharts(list) {
  const out = [];
  for (const { key, title } of list) {
    const svg = document.querySelector(`[data-chart="${key}"] svg`);
    if (svg) out.push({ key, title, ...(await svgToPng(svg)) });
  }
  return out;
}
