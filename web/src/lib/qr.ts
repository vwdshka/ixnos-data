import qrcode from "qrcode-generator";

// A QR code as one SVG path in module units (one unit per module, no quiet zone), so it prints
// in the current ink at any size. The text should be ASCII: a URL with its path percent-encoded.
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) {
        d += `M${col} ${row}h1v1h-1z`;
      }
    }
  }
  return { size, d };
}
