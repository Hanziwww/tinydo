import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Difficulty, Locale, TimeSlot } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTodayDate(base = new Date()): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getTomorrowDate(base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const shifted = fromDateKey(dateKey);
  shifted.setDate(shifted.getDate() + offsetDays);
  return toDateKey(shifted);
}

export function getTodayDateKey(base = new Date()): string {
  return toDateKey(getTodayDate(base));
}

export function getTomorrowDateKey(base = new Date()): string {
  return toDateKey(getTomorrowDate(base));
}

export function getOverdueDays(
  targetDate: string,
  todayDate = getTodayDateKey(),
  durationDays = 1,
): number {
  const endDate = durationDays > 1 ? shiftDateKey(targetDate, durationDays - 1) : targetDate;
  if (endDate >= todayDate) return 0;

  const end = fromDateKey(endDate);
  const today = fromDateKey(todayDate);
  const diffMs = today.getTime() - end.getTime();
  return Math.max(0, Math.round(diffMs / 86400000));
}

/** 1-based day index within a multi-day task, or null if not in range */
export function getDayIndexInDuration(
  targetDate: string,
  currentDateKey: string,
  durationDays: number,
): number | null {
  if (durationDays <= 1) return 1;
  const start = fromDateKey(targetDate);
  const current = fromDateKey(currentDateKey);
  if (current < start) return null;
  const diffMs = current.getTime() - start.getTime();
  const dayIndex = Math.floor(diffMs / 86400000) + 1;
  return dayIndex >= 1 && dayIndex <= durationDays ? dayIndex : null;
}

export function isTomorrowPlanningUnlocked(unlockHour: number, now = new Date()): boolean {
  return now.getHours() >= unlockHour;
}

export function formatDateChinese(date: Date): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

export function formatDateEnglish(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDate(date: Date, locale: Locale): string {
  return locale === "zh" ? formatDateChinese(date) : formatDateEnglish(date);
}

export function formatHourLabel(hour: number, locale: Locale): string {
  if (locale === "en") {
    const period = hour >= 12 ? "PM" : "AM";
    const normalized = hour % 12 === 0 ? 12 : hour % 12;
    return `${normalized}:00 ${period}`;
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

const TAG_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

export function getRandomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, { color: string; darkColor: string }> = {
  1: { color: "#22c55e", darkColor: "#4ade80" },
  2: { color: "#3b82f6", darkColor: "#60a5fa" },
  3: { color: "#f59e0b", darkColor: "#fbbf24" },
  4: { color: "#ef4444", darkColor: "#f87171" },
};

export function formatTime(time: string | null): string {
  return time ?? "";
}

export function formatTimeSlots(slots: TimeSlot[]): string | null {
  if (slots.length === 0) return null;
  return slots.map((s) => (s.end ? `${s.start} - ${s.end}` : s.start)).join(", ");
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(Math.max(0, Math.min(1439, mins)) / 60);
  const m = Math.round(mins) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
