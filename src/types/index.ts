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

export type TaskRelationType = "dependsOn" | "blocks" | "relatedTo";

export interface TaskRelation {
  id: string;
  targetTaskId: string;
  relationType: TaskRelationType;
}

export type TodoHistoryKind = "completed" | "dailyProgress";

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
  archivedDayKeys: string[];
  outgoingRelations: TaskRelation[];
  historyDate: string | null;
  historySourceTodoId: string | null;
  historyKind: TodoHistoryKind | null;
}

export type ViewMode = "all" | "active" | "completed";
export type Theme = "dark" | "light";
export type Locale = "zh" | "en";
export type PlanningBoard = "today" | "tomorrow" | "history";

// ── TinyEvents ────────────────────────────────────────────────────────

export type EventType =
  | "created"
  | "titleChanged"
  | "tagAdded"
  | "tagRemoved"
  | "difficultyChanged"
  | "timeSlotAdded"
  | "timeSlotRemoved"
  | "timeSlotChanged"
  | "reminderChanged"
  | "subtaskAdded"
  | "subtaskRemoved"
  | "subtaskToggled"
  | "subtaskRenamed"
  | "relationAdded"
  | "relationRemoved"
  | "completed"
  | "uncompleted"
  | "movedToTomorrow"
  | "dateChanged"
  | "durationChanged"
  | "duplicated"
  | "archived"
  | "deleted";

export interface TinyEvent {
  id: string;
  todoId: string;
  eventType: EventType;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

// ── TinyPredict ───────────────────────────────────────────────────────

export type PredictionConfidence = "low" | "medium" | "high";

export type PredictionFactorKind =
  | "overdueStatus"
  | "tagMatch"
  | "timeWindow"
  | "reminder"
  | "relations"
  | "taskAge"
  | "rescheduleRisk"
  | "timelineChurn"
  | "reminderChurn"
  | "completionChurn"
  | "difficultyPenalty"
  | "durationLoad"
  | "subtasksLoad"
  | "timeLoad";

export type PredictionFactorDirection = "positive" | "negative" | "neutral";

export interface PredictionFactor {
  kind: PredictionFactorKind;
  direction: PredictionFactorDirection;
  impact: number;
  sampleCount: number;
  value: string;
}

export interface PredictionResult {
  todoId: string;
  probability: number;
  baselineProbability: number;
  effectiveSampleSize: number;
  confidence: PredictionConfidence;
  difficultyPenalty: number;
  timeLoadRatio: number;
  factors: PredictionFactor[];
}
