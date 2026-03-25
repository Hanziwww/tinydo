import { shiftDateKey } from "@/lib/utils";
import type { PlanningBoard, Todo } from "@/types";

type TodoWithOptionalDefaults = Omit<
  Todo,
  | "completedDayKeys"
  | "archivedDayKeys"
  | "outgoingRelations"
  | "historyDate"
  | "historySourceTodoId"
  | "historyKind"
> &
  Partial<
    Pick<
      Todo,
      | "completedDayKeys"
      | "archivedDayKeys"
      | "outgoingRelations"
      | "historyDate"
      | "historySourceTodoId"
      | "historyKind"
    >
  >;

export function withTodoDefaults(todo: TodoWithOptionalDefaults): Todo {
  return {
    ...todo,
    completedDayKeys: todo.completedDayKeys ?? [],
    archivedDayKeys: todo.archivedDayKeys ?? [],
    outgoingRelations: todo.outgoingRelations ?? [],
    historyDate: todo.historyDate ?? null,
    historySourceTodoId: todo.historySourceTodoId ?? null,
    historyKind: todo.historyKind ?? null,
  };
}

export function getTodoEndDate(todo: Pick<Todo, "targetDate" | "durationDays">): string {
  return shiftDateKey(todo.targetDate, Math.max(0, todo.durationDays - 1));
}

export function isTodoArchivedForDate(
  todo: Pick<Todo, "archivedDayKeys">,
  dateKey: string,
): boolean {
  return todo.archivedDayKeys.includes(dateKey);
}

export function isTodoCompletedForDate(
  todo: Pick<Todo, "completed" | "durationDays" | "completedDayKeys" | "archivedDayKeys">,
  dateKey: string,
): boolean {
  if (todo.durationDays > 1) {
    return todo.completedDayKeys.includes(dateKey) && !isTodoArchivedForDate(todo, dateKey);
  }
  return todo.completed;
}

export function isTodoVisibleOnBoard(
  todo: Pick<Todo, "targetDate" | "durationDays" | "archivedDayKeys">,
  board: PlanningBoard,
  boardDate: string,
  todayKey: string,
): boolean {
  const effectiveDate = board === "today" ? todayKey : boardDate;
  if (isTodoArchivedForDate(todo, effectiveDate)) return false;
  if (board === "today") return todo.targetDate <= todayKey;
  return todo.targetDate <= boardDate && getTodoEndDate(todo) >= boardDate;
}

export function getTodoHistoryDate(todo: Pick<Todo, "historyDate" | "targetDate">): string {
  return todo.historyDate ?? todo.targetDate;
}

export function stripRelationsToTarget(todo: Todo, targetTaskId: string): Todo {
  if (!todo.outgoingRelations.some((relation) => relation.targetTaskId === targetTaskId)) {
    return todo;
  }

  return {
    ...todo,
    outgoingRelations: todo.outgoingRelations.filter(
      (relation) => relation.targetTaskId !== targetTaskId,
    ),
  };
}
