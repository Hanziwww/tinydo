import { toPng } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

const TARGET_DPI = 360;
const PIXEL_RATIO = TARGET_DPI / 96;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function injectPngDpi(raw: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);

  const phys = new Uint8Array(21);
  const pv = new DataView(phys.buffer);
  pv.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  pv.setUint32(8, ppm);
  pv.setUint32(12, ppm);
  phys[16] = 1;
  pv.setUint32(17, crc32(phys.subarray(4, 17)));

  const ihdrDataLen = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(8);
  const insertAt = 8 + 12 + ihdrDataLen; // after PNG sig (8) + IHDR (4 len + 4 type + data + 4 crc)

  const out = new Uint8Array(raw.length + phys.length);
  out.set(raw.subarray(0, insertAt));
  out.set(phys, insertAt);
  out.set(raw.subarray(insertAt), insertAt + phys.length);
  return out;
}

export async function exportPoster(element: HTMLElement, defaultName: string) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.zIndex = "-1";
  clone.style.pointerEvents = "none";
  document.body.appendChild(clone);

  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const dataUrl = await toPng(clone, { pixelRatio: PIXEL_RATIO });

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });

    if (!filePath) return;

    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    await writeFile(filePath, injectPngDpi(bytes, TARGET_DPI));
  } finally {
    document.body.removeChild(clone);
  }
}
