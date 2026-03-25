import * as backend from "@/lib/backend";
import { isDesktop, isWindowsDesktop } from "@/lib/platform";

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isDesktop()) return false;

  if (isWindowsDesktop()) {
    return backend.getAutostartEnabled();
  }

  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!isDesktop()) return false;

  if (isWindowsDesktop()) {
    return backend.setAutostartEnabled(enabled);
  }

  const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
  const current = await isEnabled();

  if (enabled !== current) {
    if (enabled) await enable();
    else await disable();
  }

  return isEnabled();
}
