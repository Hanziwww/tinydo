export type Difficulty = 1 | 2 | 3 | 4;
export interface Tag {
  id: string;
  name: string;
  color: string;
  groupId: string | null;
}

export interface TagGroup {
  id: string;
  name: string;
  order: number;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

export interface TimeSlot {
  id: string;
  start: string;
  end: string | null;
}

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  tagIds: string[];
  difficulty: Difficulty;
  timeSlots: TimeSlot[];
  reminderMinsBefore: number | null;
  targetDate: string;
  order: number;
  createdAt: number;
  subtasks: SubTask[];
  durationDays: number;
  completedDayKeys: string[];
}

export type ViewMode = "all" | "active" | "completed";
export type Theme = "dark" | "light";
export type Locale = "zh" | "en";
export type PlanningBoard = "today" | "tomorrow" | "history";
