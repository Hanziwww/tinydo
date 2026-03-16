import { useEffect } from "react";
import { useTodoStore } from "@/stores/todoStore";
import { rescheduleReminders } from "@/lib/backend";

/**
 * Reschedule reminders in the Rust backend whenever todos change.
 * The actual timing and notification dispatch happens in Rust via tokio.
 */
export function useReminders() {
  const todos = useTodoStore((s) => s.todos);
  const hydrated = useTodoStore((s) => s._hydrated);

  useEffect(() => {
    if (!hydrated) return;
    rescheduleReminders().catch((e: unknown) => {
      console.error("Failed to reschedule reminders:", e);
    });
  }, [todos, hydrated]);
}
