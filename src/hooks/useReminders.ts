import { useEffect, useRef } from "react";
import { useTodoStore } from "@/stores/todoStore";
import { getTodayDateKey, timeToMinutes } from "@/lib/utils";

let notifReady = false;

async function ensurePermission() {
  if (notifReady) return true;
  try {
    const { isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    notifReady = ok;
    return ok;
  } catch {
    return false;
  }
}

async function notify(title: string, body: string) {
  if (!(await ensurePermission())) return;
  const { sendNotification } = await import("@tauri-apps/plugin-notification");
  sendNotification({ title, body });
}

export function useReminders() {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      const todayK = getTodayDateKey();
      const nowDate = new Date();
      const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
      const todos = useTodoStore.getState().todos;

      for (const td of todos) {
        if (td.completed || !td.timeStart || td.reminderMinsBefore == null) continue;
        if (td.targetDate !== todayK) continue;

        const startMin = timeToMinutes(td.timeStart);
        const alertMin = startMin - td.reminderMinsBefore;
        const key = `${td.id}-${todayK}`;

        if (nowMin >= alertMin && nowMin < startMin + 1 && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          const mins = startMin - nowMin;
          const body = mins > 0 ? `将在 ${mins} 分钟后开始` : "现在开始";
          notify(`📋 ${td.title}`, body);
        }
      }
    }, 15_000);

    return () => clearInterval(id);
  }, []);
}
