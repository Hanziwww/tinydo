use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const MAX_ID_LEN: usize = 64;
const MAX_REMINDER_MINS: i32 = 24 * 60;
const MAX_DURATION_DAYS: u32 = 365;

fn validate_id(value: &str, label: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        return Err(AppError::custom(format!("{label}不能为空")));
    }
    if value.len() > MAX_ID_LEN {
        return Err(AppError::custom(format!(
            "{label}长度不能超过 {MAX_ID_LEN}"
        )));
    }
    Ok(())
}

fn validate_name(value: &str, label: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        return Err(AppError::custom(format!("{label}不能为空")));
    }
    Ok(())
}

fn validate_date_key(value: &str, label: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        return Err(AppError::custom(format!("{label}不能为空")));
    }
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::custom(format!("{label}格式无效")))?;
    Ok(())
}

fn validate_hhmm(value: &str, label: &str) -> Result<(), AppError> {
    let mut parts = value.split(':');
    let hour = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .ok_or_else(|| AppError::custom(format!("{label}格式无效")))?;
    let minute = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .ok_or_else(|| AppError::custom(format!("{label}格式无效")))?;
    if parts.next().is_some() || hour > 23 || minute > 59 {
        return Err(AppError::custom(format!("{label}格式无效")));
    }
    Ok(())
}

pub fn ensure_unique_ids<'a>(
    ids: impl IntoIterator<Item = &'a str>,
    label: &str,
) -> Result<(), AppError> {
    let mut seen = HashSet::new();
    for id in ids {
        validate_id(id, label)?;
        if !seen.insert(id.to_string()) {
            return Err(AppError::custom(format!("{label}不能重复")));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubTask {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub order: i64,
}

impl SubTask {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "子任务 ID")?;
        validate_name(&self.title, "子任务标题")?;
        if self.order < 0 {
            return Err(AppError::custom("子任务顺序不能小于 0"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSlot {
    pub id: String,
    pub start: String,
    pub end: Option<String>,
}

impl TimeSlot {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "时间段 ID")?;
        validate_hhmm(&self.start, "开始时间")?;
        if let Some(end) = &self.end {
            validate_hhmm(end, "结束时间")?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskRelationType {
    DependsOn,
    Blocks,
    RelatedTo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRelation {
    pub id: String,
    pub target_task_id: String,
    pub relation_type: TaskRelationType,
}

impl TaskRelation {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "关联 ID")?;
        validate_id(&self.target_task_id, "关联目标任务 ID")?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TodoHistoryKind {
    Completed,
    DailyProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub tag_ids: Vec<String>,
    pub difficulty: u8,
    pub time_slots: Vec<TimeSlot>,
    pub reminder_mins_before: Option<i32>,
    pub target_date: String,
    pub order: f64,
    pub created_at: f64,
    pub subtasks: Vec<SubTask>,
    pub duration_days: u32,
    #[serde(default)]
    pub completed_day_keys: Vec<String>,
    #[serde(default)]
    pub archived_day_keys: Vec<String>,
    #[serde(default)]
    pub outgoing_relations: Vec<TaskRelation>,
    #[serde(default)]
    pub history_date: Option<String>,
    #[serde(default)]
    pub history_source_todo_id: Option<String>,
    #[serde(default)]
    pub history_kind: Option<TodoHistoryKind>,
}

impl Todo {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "任务 ID")?;
        validate_name(&self.title, "任务标题")?;
        validate_date_key(&self.target_date, "任务日期")?;

        if !(1..=4).contains(&self.difficulty) {
            return Err(AppError::custom("任务难度必须在 1 到 4 之间"));
        }
        if !self.order.is_finite() {
            return Err(AppError::custom("任务排序值无效"));
        }
        if !self.created_at.is_finite() || self.created_at < 0.0 {
            return Err(AppError::custom("任务创建时间无效"));
        }
        if self.duration_days == 0 || self.duration_days > MAX_DURATION_DAYS {
            return Err(AppError::custom(format!(
                "任务持续天数必须在 1 到 {MAX_DURATION_DAYS} 之间"
            )));
        }
        if let Some(reminder) = self.reminder_mins_before {
            if !(0..=MAX_REMINDER_MINS).contains(&reminder) {
                return Err(AppError::custom("提醒时间必须在 0 到 1440 分钟之间"));
            }
        }

        ensure_unique_ids(self.tag_ids.iter().map(|id| id.as_str()), "标签 ID")?;
        ensure_unique_ids(
            self.time_slots.iter().map(|slot| slot.id.as_str()),
            "时间段 ID",
        )?;
        ensure_unique_ids(
            self.subtasks.iter().map(|subtask| subtask.id.as_str()),
            "子任务 ID",
        )?;
        ensure_unique_ids(
            self.outgoing_relations
                .iter()
                .map(|relation| relation.id.as_str()),
            "任务关联 ID",
        )?;

        for slot in &self.time_slots {
            slot.validate()?;
        }
        for subtask in &self.subtasks {
            subtask.validate()?;
        }
        for relation in &self.outgoing_relations {
            relation.validate()?;
            if relation.target_task_id == self.id {
                return Err(AppError::custom("任务不能关联自己"));
            }
        }
        for completed_day in &self.completed_day_keys {
            validate_date_key(completed_day, "完成日期")?;
        }
        for archived_day in &self.archived_day_keys {
            validate_date_key(archived_day, "归档日期")?;
        }
        if let Some(history_date) = &self.history_date {
            validate_date_key(history_date, "历史日期")?;
        }
        if let Some(history_source_todo_id) = &self.history_source_todo_id {
            validate_id(history_source_todo_id, "历史来源任务 ID")?;
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub group_id: Option<String>,
}

impl Tag {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "标签 ID")?;
        validate_name(&self.name, "标签名称")?;
        validate_name(&self.color, "标签颜色")?;
        if let Some(group_id) = &self.group_id {
            validate_id(group_id, "标签组 ID")?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagGroup {
    pub id: String,
    pub name: String,
    pub order: i64,
}

impl TagGroup {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "标签组 ID")?;
        validate_name(&self.name, "标签组名称")?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub locale: String,
    pub show_timeline: bool,
    pub tomorrow_planning_unlock_hour: u32,
    pub timeline_start_hour: u32,
    pub timeline_end_hour: u32,
    pub user_name: String,
    pub mini_always_on_top: bool,
    pub mini_fade_on_blur: bool,
    pub mini_fade_opacity: f64,
    pub enable_subtasks: bool,
    pub max_duration_days: u32,
    pub full_mode_rect: Option<WindowRect>,
    pub mini_mode_position: Option<WindowPos>,
    #[serde(default = "default_event_debounce")]
    pub event_debounce_seconds: u32,
}

fn default_event_debounce() -> u32 {
    10
}

impl Settings {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_name(&self.theme, "主题")?;
        validate_name(&self.locale, "语言")?;
        if self.tomorrow_planning_unlock_hour > 23 {
            return Err(AppError::custom("明日规划开放时间必须在 0 到 23 之间"));
        }
        if self.timeline_start_hour > 23 {
            return Err(AppError::custom("时间轴开始时间必须在 0 到 23 之间"));
        }
        if !(1..=24).contains(&self.timeline_end_hour) {
            return Err(AppError::custom("时间轴结束时间必须在 1 到 24 之间"));
        }
        if self.timeline_start_hour >= self.timeline_end_hour {
            return Err(AppError::custom("时间轴开始时间必须早于结束时间"));
        }
        if !(0.0..=1.0).contains(&self.mini_fade_opacity) {
            return Err(AppError::custom("Mini 模式透明度必须在 0 到 1 之间"));
        }
        if self.max_duration_days == 0 || self.max_duration_days > MAX_DURATION_DAYS {
            return Err(AppError::custom(format!(
                "最大持续天数必须在 1 到 {MAX_DURATION_DAYS} 之间"
            )));
        }
        if let Some(rect) = &self.full_mode_rect {
            rect.validate()?;
        }
        if let Some(pos) = &self.mini_mode_position {
            pos.validate()?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowRect {
    pub w: f64,
    pub h: f64,
    pub x: f64,
    pub y: f64,
}

impl WindowRect {
    pub fn validate(&self) -> Result<(), AppError> {
        if !self.w.is_finite()
            || !self.h.is_finite()
            || !self.x.is_finite()
            || !self.y.is_finite()
            || self.w <= 0.0
            || self.h <= 0.0
        {
            return Err(AppError::custom("窗口尺寸或位置无效"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPos {
    pub x: f64,
    pub y: f64,
}

impl WindowPos {
    pub fn validate(&self) -> Result<(), AppError> {
        if !self.x.is_finite() || !self.y.is_finite() {
            return Err(AppError::custom("窗口位置无效"));
        }
        Ok(())
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            locale: "zh".into(),
            show_timeline: true,
            tomorrow_planning_unlock_hour: 20,
            timeline_start_hour: 0,
            timeline_end_hour: 24,
            user_name: String::new(),
            mini_always_on_top: true,
            mini_fade_on_blur: true,
            mini_fade_opacity: 0.45,
            enable_subtasks: true,
            max_duration_days: 5,
            full_mode_rect: None,
            mini_mode_position: None,
            event_debounce_seconds: 10,
        }
    }
}

// ── TinyEvents ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventType {
    Created,
    TitleChanged,
    TagAdded,
    TagRemoved,
    DifficultyChanged,
    TimeSlotAdded,
    TimeSlotRemoved,
    TimeSlotChanged,
    ReminderChanged,
    SubtaskAdded,
    SubtaskRemoved,
    SubtaskToggled,
    SubtaskRenamed,
    RelationAdded,
    RelationRemoved,
    Completed,
    Uncompleted,
    MovedToTomorrow,
    DateChanged,
    DurationChanged,
    Duplicated,
    Archived,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TinyEvent {
    pub id: String,
    pub todo_id: String,
    pub event_type: EventType,
    #[serde(default)]
    pub field: Option<String>,
    #[serde(default)]
    pub old_value: Option<serde_json::Value>,
    #[serde(default)]
    pub new_value: Option<serde_json::Value>,
    pub timestamp: f64,
}

impl TinyEvent {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.id, "事件 ID")?;
        validate_id(&self.todo_id, "事件任务 ID")?;
        if !self.timestamp.is_finite() || self.timestamp < 0.0 {
            return Err(AppError::custom("事件时间戳无效"));
        }
        Ok(())
    }
}

/// Data sent from the frontend during localStorage migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyData {
    pub todos: Vec<Todo>,
    pub archived_todos: Vec<Todo>,
    pub tags: Vec<Tag>,
    pub tag_groups: Vec<TagGroup>,
    pub settings: Settings,
}

/// Result returned after data import.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub todos_count: usize,
    pub archived_count: usize,
    pub tags_count: usize,
    pub tag_groups_count: usize,
    pub settings_updated: bool,
}

/// JSON export envelope, matching the frontend export format.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEnvelope {
    pub version: String,
    pub exported_at: String,
    pub todos: Vec<Todo>,
    pub archived_todos: Vec<Todo>,
    pub tags: Vec<Tag>,
    pub tag_groups: Vec<TagGroup>,
    pub settings: Settings,
    #[serde(default)]
    pub events: Vec<TinyEvent>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn todo_serde_roundtrip() {
        let todo = Todo {
            id: "abc".into(),
            title: "Test".into(),
            completed: false,
            tag_ids: vec!["t1".into()],
            difficulty: 2,
            time_slots: vec![TimeSlot {
                id: "ts1".into(),
                start: "09:00".into(),
                end: Some("10:00".into()),
            }],
            reminder_mins_before: Some(5),
            target_date: "2026-03-16".into(),
            order: 1.0,
            created_at: 1710000000000.0,
            subtasks: vec![SubTask {
                id: "st1".into(),
                title: "Sub".into(),
                completed: false,
                order: 0,
            }],
            duration_days: 1,
            completed_day_keys: vec![],
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
        };
        let json = serde_json::to_string(&todo).unwrap();
        assert!(json.contains("tagIds"));
        assert!(json.contains("timeSlots"));
        assert!(json.contains("reminderMinsBefore"));
        let parsed: Todo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "abc");
        assert_eq!(parsed.tag_ids, vec!["t1"]);
        assert!(parsed.validate().is_ok());
    }

    #[test]
    fn settings_default_values() {
        let s = Settings::default();
        assert_eq!(s.theme, "dark");
        assert_eq!(s.locale, "zh");
        assert!(s.show_timeline);
        assert_eq!(s.tomorrow_planning_unlock_hour, 20);
    }

    #[test]
    fn tag_serde_with_null_group() {
        let tag = Tag {
            id: "t1".into(),
            name: "Test".into(),
            color: "#ff0000".into(),
            group_id: None,
        };
        let json = serde_json::to_string(&tag).unwrap();
        assert!(json.contains("\"groupId\":null"));
        let parsed: Tag = serde_json::from_str(&json).unwrap();
        assert!(parsed.group_id.is_none());
    }

    #[test]
    fn legacy_data_deserialize_from_frontend_format() {
        let json = r#"{
            "todos": [],
            "archivedTodos": [],
            "tags": [],
            "tagGroups": [],
            "settings": {
                "theme": "dark",
                "locale": "zh",
                "showTimeline": true,
                "tomorrowPlanningUnlockHour": 20,
                "timelineStartHour": 0,
                "timelineEndHour": 24,
                "userName": "",
                "miniAlwaysOnTop": true,
                "miniFadeOnBlur": true,
                "miniFadeOpacity": 0.45,
                "enableSubtasks": true,
                "maxDurationDays": 5,
                "fullModeRect": null,
                "miniModePosition": null
            }
        }"#;
        let data: LegacyData = serde_json::from_str(json).unwrap();
        assert!(data.todos.is_empty());
        assert_eq!(data.settings.theme, "dark");
    }

    #[test]
    fn todo_validate_rejects_empty_id() {
        let todo = Todo {
            id: "".into(),
            title: "Bad".into(),
            completed: false,
            tag_ids: vec![],
            difficulty: 2,
            time_slots: vec![],
            reminder_mins_before: None,
            target_date: "2026-03-16".into(),
            order: 0.0,
            created_at: 1.0,
            subtasks: vec![],
            duration_days: 1,
            completed_day_keys: vec![],
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
        };
        assert!(todo.validate().is_err());
    }

    #[test]
    fn settings_validate_rejects_invalid_range() {
        let settings = Settings {
            timeline_start_hour: 20,
            timeline_end_hour: 8,
            ..Settings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn ensure_unique_ids_rejects_duplicates() {
        assert!(ensure_unique_ids(["a", "a"], "任务 ID").is_err());
    }
}
