use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubTask {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSlot {
    pub id: String,
    pub start: String,
    pub end: Option<String>,
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
    pub completed_day_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagGroup {
    pub id: String,
    pub name: String,
    pub order: i64,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowRect {
    pub w: f64,
    pub h: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPos {
    pub x: f64,
    pub y: f64,
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
        }
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
    pub settings: ExportSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub theme: String,
    pub locale: String,
    pub show_timeline: bool,
    pub tomorrow_planning_unlock_hour: u32,
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
            target_date: "20260316".into(),
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
        };
        let json = serde_json::to_string(&todo).unwrap();
        assert!(json.contains("tagIds"));
        assert!(json.contains("timeSlots"));
        assert!(json.contains("reminderMinsBefore"));
        let parsed: Todo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "abc");
        assert_eq!(parsed.tag_ids, vec!["t1"]);
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
}
