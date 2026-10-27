import qrcode from "qrcode-generator";

/** Builds a crisp, scalable SVG QR that can be rendered inline. */
export function buildWalletQrSvg(payload: string) {
  const data = payload.trim();
  if (!data) return "";
  const qr = qrcode(0, "M");
  qr.addData(data, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

/** Builds a PNG for download and sharing, where an SVG file is poorly supported. */
export function buildWalletQrPng(payload: string, size = 1024) {
  const data = payload.trim();
  if (!data || typeof document === "undefined") return Promise.resolve<Blob | null>(null);
  const qr = qrcode(0, "M");
  qr.addData(data, "Byte");
  qr.make();
  const modules = qr.getModuleCount();
  const margin = 4;
  const moduleSize = Math.max(1, Math.floor(size / (modules + margin * 2)));
  const canvas = document.createElement("canvas");
  canvas.width = moduleSize * (modules + margin * 2);
  canvas.height = canvas.width;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve<Blob | null>(null);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) context.fillRect((col + margin) * moduleSize, (row + margin) * moduleSize, moduleSize, moduleSize);
    }
  }
  return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
