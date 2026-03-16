import { toPng } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import * as backend from "@/lib/backend";

const TARGET_DPI = 360;
const PIXEL_RATIO = TARGET_DPI / 96;

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
    await backend.savePoster(filePath, base64, TARGET_DPI);
  } finally {
    document.body.removeChild(clone);
  }
}
