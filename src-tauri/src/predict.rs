use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::models::{EventType, Settings, TinyEvent, Todo, TodoHistoryKind};

const DAY_MS: f64 = 86_400_000.0;
const DEFAULT_POINT_SLOT_MINUTES: f64 = 45.0;
const MAX_LOOKBACK_DAYS: f64 = 30.0;
const HALF_LIFE_DAYS: f64 = 15.0;
const GLOBAL_PRIOR_STRENGTH: f64 = 8.0;
const FACTOR_PRIOR_STRENGTH: f64 = 6.0;
const CALIBRATION_STRENGTH: f64 = 10.0;
const SOFT_FAILURE_MULTIPLIER: f64 = 0.35;
const UNKNOWN_COMPLETION_MULTIPLIER: f64 = 0.45;
const MIN_FACTOR_SAMPLE_WEIGHT: f64 = 0.75;
const MAX_EXPLANATION_FACTORS: usize = 4;
const DIFFICULTY_WEIGHT: f64 = 0.52;
const SUBTASK_WEIGHT: f64 = 0.18;
const DURATION_WEIGHT: f64 = 0.18;
const TIME_LOAD_WEIGHT: f64 = 0.12;
const DIFFICULTY_SUBTASK_INTERACTION: f64 = 0.12;
const DIFFICULTY_DURATION_INTERACTION: f64 = 0.12;
const PENALTY_SCALE: f64 = 1.05;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PredictionConfidence {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PredictionFactorKind {
    OverdueStatus,
    TagMatch,
    TimeWindow,
    Reminder,
    Relations,
    TaskAge,
    RescheduleRisk,
    TimelineChurn,
    ReminderChurn,
    CompletionChurn,
    DifficultyPenalty,
    DurationLoad,
    SubtasksLoad,
    TimeLoad,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PredictionFactorDirection {
    Positive,
    Negative,
    Neutral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictionFactor {
    pub kind: PredictionFactorKind,
    pub direction: PredictionFactorDirection,
    pub impact: f64,
    pub sample_count: f64,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictionResult {
    pub todo_id: String,
    pub probability: f64,
    pub baseline_probability: f64,
    pub effective_sample_size: f64,
    pub confidence: PredictionConfidence,
    pub difficulty_penalty: f64,
    pub time_load_ratio: f64,
    pub factors: Vec<PredictionFactor>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TimeBucket {
    None,
    Morning,
    Afternoon,
    Evening,
}

impl TimeBucket {
    fn as_value(self) -> String {
        match self {
            TimeBucket::None => "none".into(),
            TimeBucket::Morning => "morning".into(),
            TimeBucket::Afternoon => "afternoon".into(),
            TimeBucket::Evening => "evening".into(),
        }
    }
}

#[derive(Debug, Default, Clone)]
struct EventStats {
    reschedule_count: usize,
    timeline_churn_count: usize,
    reminder_churn_count: usize,
    completion_churn_count: usize,
}

#[derive(Debug, Clone)]
struct TaskFeatures {
    tag_ids: Vec<String>,
    time_bucket: TimeBucket,
    reminder_bucket: u8,
    relation_bucket: u8,
    task_age_bucket: u8,
    reschedule_bucket: u8,
    timeline_churn_bucket: u8,
    reminder_churn_bucket: u8,
    completion_churn_bucket: u8,
    difficulty_level: usize,
    duration_level: usize,
    subtask_level: usize,
    time_load_level: usize,
    time_load_ratio: f64,
}

#[derive(Debug, Clone)]
struct TrainingSample {
    source_id: String,
    on_time: bool,
    weight: f64,
    features: TaskFeatures,
}

#[derive(Debug, Clone)]
struct FactorEstimate {
    factor: PredictionFactor,
    delta_logit: f64,
}

#[derive(Debug, Clone)]
struct PenaltyDimension {
    penalties: Vec<f64>,
    sample_counts: Vec<f64>,
}

#[derive(Debug, Clone)]
struct DifficultyPenaltyModel {
    difficulty: PenaltyDimension,
    duration: PenaltyDimension,
    subtasks: PenaltyDimension,
    time_load: PenaltyDimension,
}

#[derive(Debug, Clone, Copy)]
struct DifficultyPenaltyBreakdown {
    difficulty: f64,
    duration: f64,
    subtasks: f64,
    time_load: f64,
    difficulty_subtasks_interaction: f64,
    difficulty_duration_interaction: f64,
    total: f64,
}

fn decay_weight(days_ago: f64) -> f64 {
    if days_ago > MAX_LOOKBACK_DAYS {
        return 0.0;
    }
    let lambda = (2.0_f64).ln() / HALF_LIFE_DAYS;
    (-lambda * days_ago).exp()
}

fn now_ms() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64
}

fn days_between_ms(ts_ms: f64, now: f64) -> f64 {
    ((now - ts_ms) / DAY_MS).max(0.0)
}

fn parse_date_to_ms(date_str: &str) -> Option<f64> {
    chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .ok()
        .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis() as f64)
}

fn due_cutoff_ms(todo: &Todo) -> Option<f64> {
    parse_date_to_ms(&todo.target_date)
        .map(|start_ms| start_ms + DAY_MS * todo.duration_days as f64)
}

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

fn logit(p: f64) -> f64 {
    let clamped = p.clamp(1e-4, 1.0 - 1e-4);
    (clamped / (1.0 - clamped)).ln()
}

fn round_probability(p: f64) -> f64 {
    (p.clamp(0.0, 1.0) * 10_000.0).round() / 10_000.0
}

fn parse_hhmm_to_minutes(value: &str) -> Option<i32> {
    let mut parts = value.split(':');
    let hour = parts.next()?.parse::<i32>().ok()?;
    let minute = parts.next()?.parse::<i32>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(hour * 60 + minute)
}

fn slot_duration_minutes(slot: &crate::models::TimeSlot) -> f64 {
    let start = parse_hhmm_to_minutes(&slot.start).unwrap_or(0);
    let end = slot
        .end
        .as_deref()
        .and_then(parse_hhmm_to_minutes)
        .filter(|end_minutes| *end_minutes > start)
        .unwrap_or(start + DEFAULT_POINT_SLOT_MINUTES as i32);
    f64::from((end - start).max(0))
}

fn total_scheduled_minutes(todo: &Todo) -> f64 {
    todo.time_slots
        .iter()
        .map(slot_duration_minutes)
        .sum::<f64>()
}

fn overlap_minutes(a: &crate::models::TimeSlot, b: &crate::models::TimeSlot) -> f64 {
    let a_start = parse_hhmm_to_minutes(&a.start).unwrap_or(0);
    let a_end = a
        .end
        .as_deref()
        .and_then(parse_hhmm_to_minutes)
        .filter(|end_minutes| *end_minutes > a_start)
        .unwrap_or(a_start + DEFAULT_POINT_SLOT_MINUTES as i32);
    let b_start = parse_hhmm_to_minutes(&b.start).unwrap_or(0);
    let b_end = b
        .end
        .as_deref()
        .and_then(parse_hhmm_to_minutes)
        .filter(|end_minutes| *end_minutes > b_start)
        .unwrap_or(b_start + DEFAULT_POINT_SLOT_MINUTES as i32);

    f64::from((a_end.min(b_end) - a_start.max(b_start)).max(0))
}

fn competing_minutes(todo: &Todo, peers: &[&Todo]) -> f64 {
    if todo.time_slots.is_empty() {
        return 0.0;
    }
    let mut total = 0.0;
    for slot in &todo.time_slots {
        for peer in peers {
            for peer_slot in &peer.time_slots {
                total += overlap_minutes(slot, peer_slot);
            }
        }
    }
    total
}

fn available_minutes(settings: &Settings, duration_days: u32) -> f64 {
    let start_hour = settings.timeline_start_hour.min(23);
    let end_hour = settings.timeline_end_hour.max(start_hour + 1);
    let daily_minutes = (end_hour - start_hour).max(1) as f64 * 60.0;
    (daily_minutes * duration_days.max(1) as f64).max(60.0)
}

fn time_load_ratio(todo: &Todo, peers: &[&Todo], settings: &Settings) -> f64 {
    let own_minutes = total_scheduled_minutes(todo);
    if own_minutes <= 0.0 {
        return 0.0;
    }
    let competing = competing_minutes(todo, peers);
    let available = available_minutes(settings, todo.duration_days);
    ((own_minutes + 0.7 * competing) / available).clamp(0.0, 2.0)
}

fn time_bucket(todo: &Todo) -> TimeBucket {
    match todo.time_slots.first() {
        Some(slot) => {
            let hour: u32 = slot
                .start
                .split(':')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(12);
            if hour < 6 {
                TimeBucket::None
            } else if hour < 12 {
                TimeBucket::Morning
            } else if hour < 18 {
                TimeBucket::Afternoon
            } else {
                TimeBucket::Evening
            }
        }
        None => TimeBucket::None,
    }
}

fn difficulty_level(difficulty: u8) -> usize {
    difficulty.clamp(1, 4) as usize - 1
}

fn subtask_level(count: usize) -> usize {
    match count {
        0 => 0,
        1..=2 => 1,
        3..=5 => 2,
        _ => 3,
    }
}

fn duration_level(days: u32) -> usize {
    match days {
        0 | 1 => 0,
        2..=3 => 1,
        4..=7 => 2,
        _ => 3,
    }
}

fn reminder_bucket(reminder: Option<i32>) -> u8 {
    match reminder {
        None => 0,
        Some(mins) if mins <= 15 => 1,
        Some(mins) if mins <= 60 => 2,
        Some(_) => 3,
    }
}

fn relation_bucket(count: usize) -> u8 {
    match count {
        0 => 0,
        1 => 1,
        _ => 2,
    }
}

fn time_load_level(ratio: f64) -> usize {
    if ratio < 0.05 {
        0
    } else if ratio < 0.18 {
        1
    } else if ratio < 0.35 {
        2
    } else if ratio < 0.6 {
        3
    } else {
        4
    }
}

fn task_age_bucket(created_at: f64, reference_ms: f64) -> u8 {
    if !created_at.is_finite() || created_at <= 0.0 {
        return 0;
    }
    let age_days = days_between_ms(created_at, reference_ms);
    if age_days < 1.0 {
        0
    } else if age_days < 4.0 {
        1
    } else if age_days < 8.0 {
        2
    } else {
        3
    }
}

fn change_count_bucket(count: usize) -> u8 {
    match count {
        0 => 0,
        1 => 1,
        2..=3 => 2,
        _ => 3,
    }
}

fn bucket_value(bucket: u8) -> String {
    match bucket {
        0 => "low".into(),
        1 => "medium".into(),
        2 => "high".into(),
        3 => "veryHigh".into(),
        _ => bucket.to_string(),
    }
}

fn build_event_index(events: &[TinyEvent]) -> HashMap<String, Vec<&TinyEvent>> {
    let mut index: HashMap<String, Vec<&TinyEvent>> = HashMap::new();
    for event in events {
        index.entry(event.todo_id.clone()).or_default().push(event);
    }
    for values in index.values_mut() {
        values.sort_by(|a, b| a.timestamp.total_cmp(&b.timestamp));
    }
    index
}

fn event_stats_for(
    source_id: &str,
    up_to_ms: f64,
    event_index: &HashMap<String, Vec<&TinyEvent>>,
) -> EventStats {
    let mut stats = EventStats::default();
    let Some(events) = event_index.get(source_id) else {
        return stats;
    };
    for event in events {
        if event.timestamp > up_to_ms {
            break;
        }
        match event.event_type {
            EventType::MovedToTomorrow | EventType::DateChanged => stats.reschedule_count += 1,
            EventType::TimeSlotAdded
            | EventType::TimeSlotRemoved
            | EventType::TimeSlotChanged
            | EventType::DurationChanged => stats.timeline_churn_count += 1,
            EventType::ReminderChanged => stats.reminder_churn_count += 1,
            EventType::Uncompleted => stats.completion_churn_count += 1,
            _ => {}
        }
    }
    stats
}

fn extract_features(
    todo: &Todo,
    event_stats: &EventStats,
    reference_ms: f64,
    peers: &[&Todo],
    settings: &Settings,
) -> TaskFeatures {
    let ratio = time_load_ratio(todo, peers, settings);
    TaskFeatures {
        tag_ids: todo.tag_ids.clone(),
        time_bucket: time_bucket(todo),
        reminder_bucket: reminder_bucket(todo.reminder_mins_before),
        relation_bucket: relation_bucket(todo.outgoing_relations.len()),
        task_age_bucket: task_age_bucket(todo.created_at, reference_ms),
        reschedule_bucket: change_count_bucket(event_stats.reschedule_count),
        timeline_churn_bucket: change_count_bucket(event_stats.timeline_churn_count),
        reminder_churn_bucket: change_count_bucket(event_stats.reminder_churn_count),
        completion_churn_bucket: change_count_bucket(event_stats.completion_churn_count),
        difficulty_level: difficulty_level(todo.difficulty),
        duration_level: duration_level(todo.duration_days),
        subtask_level: subtask_level(todo.subtasks.len()),
        time_load_level: time_load_level(ratio),
        time_load_ratio: ratio,
    }
}

fn build_training_samples(
    archived_todos: &[Todo],
    active_todos: &[Todo],
    events: &[TinyEvent],
    settings: &Settings,
    now_ms: f64,
    today_ms: f64,
) -> Vec<TrainingSample> {
    let event_index = build_event_index(events);
    let mut samples = Vec::new();

    for todo in archived_todos {
        if todo.history_kind.as_ref() == Some(&TodoHistoryKind::DailyProgress) {
            continue;
        }
        let Some(due_cutoff) = due_cutoff_ms(todo) else {
            continue;
        };
        let outcome_ms =
            if let Some(history_ms) = todo.history_date.as_deref().and_then(parse_date_to_ms) {
                history_ms
            } else if todo.completed {
                due_cutoff
            } else {
                today_ms
            };
        let days_ago = days_between_ms(outcome_ms, now_ms);
        let decay = decay_weight(days_ago);
        if decay < 1e-9 {
            continue;
        }
        let outcome_reliability = if todo.history_date.is_some() {
            1.0
        } else {
            UNKNOWN_COMPLETION_MULTIPLIER
        };
        let event_stats = event_stats_for(
            todo.history_source_todo_id
                .as_deref()
                .unwrap_or(todo.id.as_str()),
            outcome_ms,
            &event_index,
        );
        let peers = archived_todos
            .iter()
            .filter(|peer| {
                peer.id != todo.id
                    && peer.target_date == todo.target_date
                    && peer.history_kind.as_ref() != Some(&TodoHistoryKind::DailyProgress)
            })
            .collect::<Vec<_>>();
        samples.push(TrainingSample {
            source_id: todo
                .history_source_todo_id
                .clone()
                .unwrap_or_else(|| todo.id.clone()),
            on_time: todo.completed && outcome_ms < due_cutoff,
            weight: decay * outcome_reliability,
            features: extract_features(todo, &event_stats, outcome_ms, &peers, settings),
        });
    }

    for todo in active_todos {
        let Some(due_cutoff) = due_cutoff_ms(todo) else {
            continue;
        };

        if todo.completed {
            let outcome_ms = today_ms;
            let decay = decay_weight(days_between_ms(outcome_ms, now_ms));
            if decay < 1e-9 {
                continue;
            }
            let event_stats = event_stats_for(todo.id.as_str(), outcome_ms, &event_index);
            let peers = active_todos
                .iter()
                .filter(|peer| peer.id != todo.id && peer.target_date == todo.target_date)
                .collect::<Vec<_>>();
            samples.push(TrainingSample {
                source_id: todo.id.clone(),
                on_time: outcome_ms < due_cutoff,
                weight: decay,
                features: extract_features(todo, &event_stats, outcome_ms, &peers, settings),
            });
            continue;
        }

        if today_ms < due_cutoff {
            continue;
        }

        let decay = decay_weight(days_between_ms(due_cutoff, now_ms));
        if decay < 1e-9 {
            continue;
        }
        let event_stats = event_stats_for(todo.id.as_str(), due_cutoff, &event_index);
        let peers = active_todos
            .iter()
            .filter(|peer| peer.id != todo.id && peer.target_date == todo.target_date)
            .collect::<Vec<_>>();
        samples.push(TrainingSample {
            source_id: todo.id.clone(),
            on_time: false,
            weight: decay * SOFT_FAILURE_MULTIPLIER,
            features: extract_features(todo, &event_stats, due_cutoff, &peers, settings),
        });
    }

    samples
}

fn global_baseline(samples: &[TrainingSample]) -> (f64, f64) {
    let success_weight = samples
        .iter()
        .filter(|sample| sample.on_time)
        .map(|sample| sample.weight)
        .sum::<f64>();
    let total_weight = samples.iter().map(|sample| sample.weight).sum::<f64>();
    if total_weight <= 1e-9 {
        return (0.5, 0.0);
    }
    let baseline =
        (0.5 * GLOBAL_PRIOR_STRENGTH + success_weight) / (GLOBAL_PRIOR_STRENGTH + total_weight);
    (baseline.clamp(0.05, 0.95), total_weight)
}

fn confidence_from_sample_size(sample_size: f64) -> PredictionConfidence {
    if sample_size < 4.0 {
        PredictionConfidence::Low
    } else if sample_size < 12.0 {
        PredictionConfidence::Medium
    } else {
        PredictionConfidence::High
    }
}

fn build_monotonic_dimension<F>(
    levels: usize,
    baseline_rate: f64,
    samples: &[TrainingSample],
    extractor: F,
) -> PenaltyDimension
where
    F: Fn(&TaskFeatures) -> usize,
{
    let mut success = vec![0.0; levels];
    let mut total = vec![0.0; levels];
    for sample in samples {
        let level = extractor(&sample.features).min(levels - 1);
        total[level] += sample.weight;
        if sample.on_time {
            success[level] += sample.weight;
        }
    }

    let mut rates = (0..levels)
        .map(|level| {
            (baseline_rate * FACTOR_PRIOR_STRENGTH + success[level])
                / (FACTOR_PRIOR_STRENGTH + total[level])
        })
        .collect::<Vec<_>>();

    for level in 1..levels {
        rates[level] = rates[level].min(rates[level - 1]);
    }

    let easiest = rates[0];
    let penalties = (0..levels)
        .map(|level| {
            let reliability = total[level] / (total[level] + FACTOR_PRIOR_STRENGTH);
            (logit(easiest) - logit(rates[level])).max(0.0) * reliability
        })
        .collect::<Vec<_>>();

    PenaltyDimension {
        penalties,
        sample_counts: total,
    }
}

fn build_difficulty_penalty_model(
    samples: &[TrainingSample],
    baseline_rate: f64,
) -> DifficultyPenaltyModel {
    DifficultyPenaltyModel {
        difficulty: build_monotonic_dimension(4, baseline_rate, samples, |features| {
            features.difficulty_level
        }),
        duration: build_monotonic_dimension(4, baseline_rate, samples, |features| {
            features.duration_level
        }),
        subtasks: build_monotonic_dimension(4, baseline_rate, samples, |features| {
            features.subtask_level
        }),
        time_load: build_monotonic_dimension(5, baseline_rate, samples, |features| {
            features.time_load_level
        }),
    }
}

const STRUCTURAL_DIFFICULTY_PRIOR: [f64; 4] = [0.0, 0.08, 0.22, 0.42];
const STRUCTURAL_SUBTASK_PRIOR: [f64; 4] = [0.0, 0.04, 0.10, 0.18];
const STRUCTURAL_DURATION_PRIOR: [f64; 4] = [0.0, 0.05, 0.12, 0.20];
const STRUCTURAL_TIME_LOAD_PRIOR: [f64; 5] = [0.0, 0.02, 0.06, 0.12, 0.20];

fn blend_with_structural_prior(
    data_penalties: &[f64],
    structural_prior: &[f64],
    sample_counts: &[f64],
) -> Vec<f64> {
    data_penalties
        .iter()
        .zip(structural_prior.iter())
        .zip(sample_counts.iter())
        .map(|((&data, &prior), &count)| {
            let data_weight = (count / (count + FACTOR_PRIOR_STRENGTH)).clamp(0.0, 1.0);
            data * data_weight + prior * (1.0 - data_weight)
        })
        .collect()
}

fn compute_difficulty_penalty(
    features: &TaskFeatures,
    model: &DifficultyPenaltyModel,
) -> DifficultyPenaltyBreakdown {
    let blended_difficulty = blend_with_structural_prior(
        &model.difficulty.penalties,
        &STRUCTURAL_DIFFICULTY_PRIOR,
        &model.difficulty.sample_counts,
    );
    let blended_subtasks = blend_with_structural_prior(
        &model.subtasks.penalties,
        &STRUCTURAL_SUBTASK_PRIOR,
        &model.subtasks.sample_counts,
    );
    let blended_duration = blend_with_structural_prior(
        &model.duration.penalties,
        &STRUCTURAL_DURATION_PRIOR,
        &model.duration.sample_counts,
    );
    let blended_time_load = blend_with_structural_prior(
        &model.time_load.penalties,
        &STRUCTURAL_TIME_LOAD_PRIOR,
        &model.time_load.sample_counts,
    );

    let difficulty = blended_difficulty[features.difficulty_level];
    let duration = blended_duration[features.duration_level];
    let subtasks = blended_subtasks[features.subtask_level];
    let time_load = blended_time_load[features.time_load_level];
    let difficulty_subtasks_interaction = difficulty * subtasks * DIFFICULTY_SUBTASK_INTERACTION;
    let difficulty_duration_interaction = difficulty * duration * DIFFICULTY_DURATION_INTERACTION;
    let total = PENALTY_SCALE
        * (DIFFICULTY_WEIGHT * difficulty
            + SUBTASK_WEIGHT * subtasks
            + DURATION_WEIGHT * duration
            + TIME_LOAD_WEIGHT * time_load
            + difficulty_subtasks_interaction
            + difficulty_duration_interaction);
    DifficultyPenaltyBreakdown {
        difficulty,
        duration,
        subtasks,
        time_load,
        difficulty_subtasks_interaction,
        difficulty_duration_interaction,
        total,
    }
}

fn estimate_factor<F>(
    kind: PredictionFactorKind,
    value: String,
    samples: &[TrainingSample],
    baseline_rate: f64,
    weight_scale: f64,
    predicate: F,
) -> Option<FactorEstimate>
where
    F: Fn(&TaskFeatures) -> bool,
{
    let mut success_weight = 0.0;
    let mut total_weight = 0.0;
    for sample in samples {
        if predicate(&sample.features) {
            total_weight += sample.weight;
            if sample.on_time {
                success_weight += sample.weight;
            }
        }
    }
    if total_weight < MIN_FACTOR_SAMPLE_WEIGHT {
        return None;
    }

    let posterior_rate = (baseline_rate * FACTOR_PRIOR_STRENGTH + success_weight)
        / (FACTOR_PRIOR_STRENGTH + total_weight);
    let reliability = total_weight / (total_weight + FACTOR_PRIOR_STRENGTH);
    let delta_logit = (logit(posterior_rate) - logit(baseline_rate)) * weight_scale * reliability;
    let impact = sigmoid(logit(baseline_rate) + delta_logit) - baseline_rate;
    let direction = if impact > 0.005 {
        PredictionFactorDirection::Positive
    } else if impact < -0.005 {
        PredictionFactorDirection::Negative
    } else {
        PredictionFactorDirection::Neutral
    };

    Some(FactorEstimate {
        delta_logit,
        factor: PredictionFactor {
            kind,
            direction,
            impact,
            sample_count: total_weight,
            value,
        },
    })
}

fn penalty_factor(
    kind: PredictionFactorKind,
    value: String,
    sample_count: f64,
    penalty_logit: f64,
    reference_logit: f64,
) -> Option<FactorEstimate> {
    if penalty_logit <= 1e-6 {
        return None;
    }
    let impact = sigmoid(reference_logit - penalty_logit) - sigmoid(reference_logit);
    Some(FactorEstimate {
        delta_logit: -penalty_logit,
        factor: PredictionFactor {
            kind,
            direction: PredictionFactorDirection::Negative,
            impact,
            sample_count,
            value,
        },
    })
}

fn maybe_push_factor(
    estimates: &mut Vec<FactorEstimate>,
    kind: PredictionFactorKind,
    value: String,
    samples: &[TrainingSample],
    baseline_rate: f64,
    weight_scale: f64,
    predicate: impl Fn(&TaskFeatures) -> bool,
) {
    if let Some(estimate) =
        estimate_factor(kind, value, samples, baseline_rate, weight_scale, predicate)
    {
        estimates.push(estimate);
    }
}

fn current_overdue_days(todo: &Todo, today_ms: f64) -> u32 {
    let Some(due_cutoff) = due_cutoff_ms(todo) else {
        return 0;
    };
    if today_ms < due_cutoff {
        return 0;
    }
    ((today_ms - due_cutoff) / DAY_MS).round().max(0.0) as u32 + 1
}

fn predict_single(
    todo: &Todo,
    all_active_todos: &[Todo],
    samples: &[TrainingSample],
    events: &[TinyEvent],
    settings: &Settings,
    today_ms: f64,
) -> PredictionResult {
    let current_source_id = todo
        .history_source_todo_id
        .clone()
        .unwrap_or_else(|| todo.id.clone());
    let scoped_samples = samples
        .iter()
        .filter(|sample| sample.source_id != current_source_id)
        .cloned()
        .collect::<Vec<_>>();
    let (baseline_rate, effective_sample_size) = global_baseline(&scoped_samples);
    let confidence = confidence_from_sample_size(effective_sample_size);

    if today_ms >= due_cutoff_ms(todo).unwrap_or(f64::INFINITY) {
        return PredictionResult {
            todo_id: todo.id.clone(),
            probability: 0.0,
            baseline_probability: round_probability(baseline_rate),
            effective_sample_size: (effective_sample_size * 10.0).round() / 10.0,
            confidence,
            difficulty_penalty: 0.0,
            time_load_ratio: 0.0,
            factors: vec![PredictionFactor {
                kind: PredictionFactorKind::OverdueStatus,
                direction: PredictionFactorDirection::Negative,
                impact: -baseline_rate,
                sample_count: effective_sample_size,
                value: current_overdue_days(todo, today_ms).to_string(),
            }],
        };
    }

    let event_index = build_event_index(events);
    let current_event_stats = event_stats_for(todo.id.as_str(), today_ms, &event_index);
    let peers = all_active_todos
        .iter()
        .filter(|peer| {
            peer.id != todo.id && peer.target_date == todo.target_date && !peer.completed
        })
        .collect::<Vec<_>>();
    let current = extract_features(todo, &current_event_stats, today_ms, &peers, settings);
    let penalty_model = build_difficulty_penalty_model(&scoped_samples, baseline_rate);
    let penalty = compute_difficulty_penalty(&current, &penalty_model);
    let mut estimates = Vec::new();

    if !current.tag_ids.is_empty() {
        let tag_set = current.tag_ids.clone();
        maybe_push_factor(
            &mut estimates,
            PredictionFactorKind::TagMatch,
            tag_set.len().to_string(),
            &scoped_samples,
            baseline_rate,
            0.95,
            move |features| tag_set.iter().any(|tag| features.tag_ids.contains(tag)),
        );
    }

    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::TimeWindow,
        current.time_bucket.as_value(),
        &scoped_samples,
        baseline_rate,
        0.7,
        |features| features.time_bucket == current.time_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::Reminder,
        bucket_value(current.reminder_bucket),
        &scoped_samples,
        baseline_rate,
        0.55,
        |features| features.reminder_bucket == current.reminder_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::Relations,
        bucket_value(current.relation_bucket),
        &scoped_samples,
        baseline_rate,
        0.45,
        |features| features.relation_bucket == current.relation_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::TaskAge,
        bucket_value(current.task_age_bucket),
        &scoped_samples,
        baseline_rate,
        0.5,
        |features| features.task_age_bucket == current.task_age_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::RescheduleRisk,
        bucket_value(current.reschedule_bucket),
        &scoped_samples,
        baseline_rate,
        1.0,
        |features| features.reschedule_bucket == current.reschedule_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::TimelineChurn,
        bucket_value(current.timeline_churn_bucket),
        &scoped_samples,
        baseline_rate,
        0.75,
        |features| features.timeline_churn_bucket == current.timeline_churn_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::ReminderChurn,
        bucket_value(current.reminder_churn_bucket),
        &scoped_samples,
        baseline_rate,
        0.6,
        |features| features.reminder_churn_bucket == current.reminder_churn_bucket,
    );
    maybe_push_factor(
        &mut estimates,
        PredictionFactorKind::CompletionChurn,
        bucket_value(current.completion_churn_bucket),
        &scoped_samples,
        baseline_rate,
        0.85,
        |features| features.completion_churn_bucket == current.completion_churn_bucket,
    );

    let baseline_logit = logit(baseline_rate);
    let context_logit = estimates
        .iter()
        .map(|estimate| estimate.delta_logit)
        .sum::<f64>();
    let reference_logit = baseline_logit + context_logit;
    if let Some(estimate) = penalty_factor(
        PredictionFactorKind::DifficultyPenalty,
        (current.difficulty_level + 1).to_string(),
        penalty_model.difficulty.sample_counts[current.difficulty_level],
        PENALTY_SCALE * DIFFICULTY_WEIGHT * penalty.difficulty,
        reference_logit,
    ) {
        estimates.push(estimate);
    }
    if let Some(estimate) = penalty_factor(
        PredictionFactorKind::SubtasksLoad,
        bucket_value(current.subtask_level as u8),
        penalty_model.subtasks.sample_counts[current.subtask_level],
        PENALTY_SCALE
            * (SUBTASK_WEIGHT * penalty.subtasks + penalty.difficulty_subtasks_interaction),
        reference_logit,
    ) {
        estimates.push(estimate);
    }
    if let Some(estimate) = penalty_factor(
        PredictionFactorKind::DurationLoad,
        bucket_value(current.duration_level as u8),
        penalty_model.duration.sample_counts[current.duration_level],
        PENALTY_SCALE
            * (DURATION_WEIGHT * penalty.duration + penalty.difficulty_duration_interaction),
        reference_logit,
    ) {
        estimates.push(estimate);
    }
    if let Some(estimate) = penalty_factor(
        PredictionFactorKind::TimeLoad,
        format!("{:.2}", current.time_load_ratio),
        penalty_model.time_load.sample_counts[current.time_load_level],
        PENALTY_SCALE * TIME_LOAD_WEIGHT * penalty.time_load,
        reference_logit,
    ) {
        estimates.push(estimate);
    }

    let raw_logit = reference_logit - penalty.total;
    let calibration = effective_sample_size / (effective_sample_size + CALIBRATION_STRENGTH);
    let calibrated_logit =
        baseline_logit + (raw_logit - baseline_logit) * calibration.clamp(0.2, 1.0);
    let probability = round_probability(sigmoid(calibrated_logit));

    estimates.sort_by(|a, b| b.factor.impact.abs().total_cmp(&a.factor.impact.abs()));

    PredictionResult {
        todo_id: todo.id.clone(),
        probability,
        baseline_probability: round_probability(baseline_rate),
        effective_sample_size: (effective_sample_size * 10.0).round() / 10.0,
        confidence,
        difficulty_penalty: round_probability((penalty.total / 4.0).clamp(0.0, 1.0)),
        time_load_ratio: round_probability(current.time_load_ratio.clamp(0.0, 1.0)),
        factors: estimates
            .into_iter()
            .filter(|estimate| estimate.factor.direction != PredictionFactorDirection::Neutral)
            .take(MAX_EXPLANATION_FACTORS)
            .map(|estimate| estimate.factor)
            .collect(),
    }
}

pub fn predict_all(
    active_todos: &[Todo],
    archived_todos: &[Todo],
    events: &[TinyEvent],
    settings: &Settings,
    today_str: &str,
) -> Vec<PredictionResult> {
    let now = now_ms();
    let today_ms = parse_date_to_ms(today_str).unwrap_or(now);
    let samples = build_training_samples(
        archived_todos,
        active_todos,
        events,
        settings,
        now,
        today_ms,
    );

    active_todos
        .iter()
        .filter(|todo| !todo.completed)
        .map(|todo| predict_single(todo, active_todos, &samples, events, settings, today_ms))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{TimeSlot, TinyEvent};

    fn make_todo(id: &str, diff: u8, completed: bool, date: &str) -> Todo {
        Todo {
            id: id.into(),
            title: format!("Task {id}"),
            completed,
            tag_ids: vec![],
            difficulty: diff,
            time_slots: vec![],
            reminder_mins_before: None,
            target_date: date.into(),
            order: 0.0,
            created_at: parse_date_to_ms(date).unwrap_or(0.0),
            subtasks: vec![],
            duration_days: 1,
            completed_day_keys: vec![],
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: Some(date.into()),
            history_source_todo_id: None,
            history_kind: Some(TodoHistoryKind::Completed),
        }
    }

    fn settings() -> Settings {
        Settings {
            timeline_start_hour: 8,
            timeline_end_hour: 22,
            ..Settings::default()
        }
    }

    fn make_event(todo_id: &str, event_type: EventType, timestamp: f64) -> TinyEvent {
        TinyEvent {
            id: format!("{todo_id}-{event_type:?}-{timestamp}"),
            todo_id: todo_id.into(),
            event_type,
            field: None,
            old_value: None,
            new_value: None,
            timestamp,
        }
    }

    #[test]
    fn empty_history_gives_50_percent() {
        let active = vec![make_todo("a1", 2, false, "2026-03-19")];
        let results = predict_all(&active, &[], &[], &settings(), "2026-03-19");
        assert_eq!(results.len(), 1);
        assert!((results[0].probability - 0.5).abs() < 0.01);
    }

    #[test]
    fn completed_todo_excluded() {
        let active = vec![make_todo("a1", 2, true, "2026-03-19")];
        let results = predict_all(&active, &[], &[], &settings(), "2026-03-19");
        assert!(results.is_empty());
    }

    #[test]
    fn daily_progress_snapshots_excluded() {
        let active = vec![make_todo("a1", 2, false, "2026-03-19")];
        let mut snap = make_todo("dp1", 2, true, "2026-03-18");
        snap.history_kind = Some(TodoHistoryKind::DailyProgress);
        let results = predict_all(&active, &[snap], &[], &settings(), "2026-03-19");
        assert!((results[0].probability - 0.5).abs() < 0.01);
    }

    #[test]
    fn current_overdue_task_returns_zero_on_time_probability() {
        let active = vec![make_todo("a1", 2, false, "2026-03-18")];
        let history = vec![make_todo("h1", 2, true, "2026-03-17")];
        let results = predict_all(&active, &history, &[], &settings(), "2026-03-19");
        assert_eq!(results[0].probability, 0.0);
        assert_eq!(
            results[0].factors[0].kind,
            PredictionFactorKind::OverdueStatus
        );
    }

    #[test]
    fn active_completed_success_contributes_before_archive() {
        let mut completed_active = make_todo("done", 2, true, "2026-03-19");
        completed_active.history_kind = None;
        let active = vec![
            make_todo("target", 2, false, "2026-03-19"),
            completed_active,
        ];
        let results = predict_all(&active, &[], &[], &settings(), "2026-03-19");
        assert!(results[0].effective_sample_size > 0.0);
        assert!(results[0].probability > 0.5);
    }

    #[test]
    fn tag_matching_affects_prediction() {
        let mut active_tagged = make_todo("a1", 2, false, "2026-03-19");
        active_tagged.tag_ids = vec!["work".into()];

        let mut history = Vec::new();
        for i in 0..5 {
            let mut t = make_todo(
                &format!("hw{i}"),
                2,
                false,
                &format!("2026-03-{:02}", 12 + i),
            );
            t.tag_ids = vec!["work".into()];
            history.push(t);
        }
        for i in 0..5 {
            let mut t = make_todo(
                &format!("hp{i}"),
                2,
                true,
                &format!("2026-03-{:02}", 12 + i),
            );
            t.tag_ids = vec!["personal".into()];
            history.push(t);
        }

        let results = predict_all(&[active_tagged], &history, &[], &settings(), "2026-03-19");
        assert!(results[0].probability < 0.5);
    }

    #[test]
    fn difficulty_is_monotonic() {
        let mut history = Vec::new();
        for i in 0..6 {
            history.push(make_todo(
                &format!("easy{i}"),
                1,
                true,
                &format!("2026-03-{:02}", 12 + i),
            ));
        }
        for i in 0..4 {
            history.push(make_todo(
                &format!("mid{i}"),
                2,
                true,
                &format!("2026-03-{:02}", 12 + i),
            ));
            history.push(make_todo(
                &format!("midb{i}"),
                3,
                false,
                &format!("2026-03-{:02}", 12 + i),
            ));
        }
        for i in 0..6 {
            history.push(make_todo(
                &format!("hard{i}"),
                4,
                false,
                &format!("2026-03-{:02}", 12 + i),
            ));
        }
        let p1 = predict_all(
            &[make_todo("a1", 1, false, "2026-03-19")],
            &history,
            &[],
            &settings(),
            "2026-03-19",
        )[0]
        .probability;
        let p2 = predict_all(
            &[make_todo("a2", 2, false, "2026-03-19")],
            &history,
            &[],
            &settings(),
            "2026-03-19",
        )[0]
        .probability;
        let p3 = predict_all(
            &[make_todo("a3", 3, false, "2026-03-19")],
            &history,
            &[],
            &settings(),
            "2026-03-19",
        )[0]
        .probability;
        let p4 = predict_all(
            &[make_todo("a4", 4, false, "2026-03-19")],
            &history,
            &[],
            &settings(),
            "2026-03-19",
        )[0]
        .probability;
        assert!(p1 >= p2 && p2 >= p3 && p3 >= p4);
    }

    #[test]
    fn reschedule_events_lower_prediction() {
        let target = make_todo("target", 2, false, "2026-03-19");
        let history_good = vec![
            make_todo("g1", 2, true, "2026-03-14"),
            make_todo("g2", 2, true, "2026-03-15"),
            make_todo("g3", 2, true, "2026-03-16"),
        ];
        let history_bad = vec![
            make_todo("b1", 2, false, "2026-03-14"),
            make_todo("b2", 2, false, "2026-03-15"),
            make_todo("b3", 2, false, "2026-03-16"),
        ];
        let mut history = Vec::new();
        history.extend(history_good);
        history.extend(history_bad);

        let events = vec![
            make_event(
                "b1",
                EventType::MovedToTomorrow,
                parse_date_to_ms("2026-03-13").unwrap(),
            ),
            make_event(
                "b2",
                EventType::DateChanged,
                parse_date_to_ms("2026-03-14").unwrap(),
            ),
            make_event(
                "b3",
                EventType::MovedToTomorrow,
                parse_date_to_ms("2026-03-15").unwrap(),
            ),
            make_event(
                "target",
                EventType::DateChanged,
                parse_date_to_ms("2026-03-18").unwrap(),
            ),
        ];

        let results = predict_all(
            std::slice::from_ref(&target),
            &history,
            &events,
            &settings(),
            "2026-03-19",
        );
        let control = predict_all(&[target], &history, &[], &settings(), "2026-03-19");
        assert!(results[0].probability < control[0].probability);
        assert!(results[0]
            .factors
            .iter()
            .any(|factor| factor.kind == PredictionFactorKind::RescheduleRisk));
    }

    #[test]
    fn time_and_reminder_features_affect_prediction() {
        let mut target = make_todo("target", 2, false, "2026-03-19");
        target.time_slots = vec![TimeSlot {
            id: "ts".into(),
            start: "09:00".into(),
            end: Some("10:00".into()),
        }];
        target.reminder_mins_before = Some(15);

        let mut history = Vec::new();
        for i in 0..4 {
            let mut t = make_todo(
                &format!("morning{i}"),
                2,
                true,
                &format!("2026-03-{:02}", 12 + i),
            );
            t.time_slots = vec![TimeSlot {
                id: format!("mts{i}"),
                start: "09:00".into(),
                end: Some("10:00".into()),
            }];
            t.reminder_mins_before = Some(15);
            history.push(t);
        }
        for i in 0..4 {
            let mut t = make_todo(
                &format!("none{i}"),
                2,
                false,
                &format!("2026-03-{:02}", 12 + i),
            );
            t.reminder_mins_before = None;
            history.push(t);
        }

        let results = predict_all(&[target], &history, &[], &settings(), "2026-03-19");
        assert!(results[0].probability > 0.5);
    }

    #[test]
    fn subtask_load_is_monotonic() {
        let mut history = Vec::new();
        for i in 0..5 {
            history.push(make_todo(
                &format!("s0-{i}"),
                2,
                true,
                &format!("2026-03-{:02}", 10 + i),
            ));
        }
        for i in 0..5 {
            let mut todo = make_todo(
                &format!("s3-{i}"),
                2,
                false,
                &format!("2026-03-{:02}", 15 + i),
            );
            todo.subtasks = (0..4)
                .map(|idx| crate::models::SubTask {
                    id: format!("sub-{i}-{idx}"),
                    title: format!("Sub {idx}"),
                    completed: false,
                    order: idx,
                })
                .collect();
            history.push(todo);
        }

        let easy = make_todo("easy", 2, false, "2026-03-19");
        let mut hard = make_todo("hard", 2, false, "2026-03-19");
        hard.subtasks = (0..5)
            .map(|idx| crate::models::SubTask {
                id: format!("curr-{idx}"),
                title: format!("Curr {idx}"),
                completed: false,
                order: idx,
            })
            .collect();

        let p_easy = predict_all(&[easy], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_hard = predict_all(&[hard], &history, &[], &settings(), "2026-03-19")[0].probability;
        assert!(p_easy >= p_hard);
    }

    #[test]
    fn duration_load_is_monotonic() {
        let mut history = Vec::new();
        for i in 0..5 {
            history.push(make_todo(
                &format!("d1-{i}"),
                2,
                true,
                &format!("2026-03-{:02}", 10 + i),
            ));
        }
        for i in 0..5 {
            let mut todo = make_todo(
                &format!("d5-{i}"),
                2,
                false,
                &format!("2026-03-{:02}", 15 + i),
            );
            todo.duration_days = 5;
            history.push(todo);
        }

        let short = make_todo("short", 2, false, "2026-03-19");
        let mut long = make_todo("long", 2, false, "2026-03-19");
        long.duration_days = 5;
        let p_short =
            predict_all(&[short], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_long = predict_all(&[long], &history, &[], &settings(), "2026-03-19")[0].probability;
        assert!(p_short >= p_long);
    }

    #[test]
    fn time_load_is_monotonic() {
        let mut history = Vec::new();
        for i in 0..4 {
            let mut low = make_todo(
                &format!("low-{i}"),
                2,
                true,
                &format!("2026-03-{:02}", 10 + i),
            );
            low.time_slots = vec![TimeSlot {
                id: format!("lts-{i}"),
                start: "09:00".into(),
                end: Some("09:30".into()),
            }];
            history.push(low);
        }
        for i in 0..4 {
            let mut high = make_todo(
                &format!("high-{i}"),
                2,
                false,
                &format!("2026-03-{:02}", 15 + i),
            );
            high.time_slots = vec![TimeSlot {
                id: format!("hts-{i}"),
                start: "09:00".into(),
                end: Some("12:00".into()),
            }];
            history.push(high.clone());
            let mut peer = make_todo(
                &format!("peer-{i}"),
                2,
                false,
                &format!("2026-03-{:02}", 15 + i),
            );
            peer.time_slots = vec![TimeSlot {
                id: format!("pts-{i}"),
                start: "09:30".into(),
                end: Some("11:30".into()),
            }];
            history.push(peer);
        }

        let mut low_load = make_todo("low-load", 2, false, "2026-03-19");
        low_load.time_slots = vec![TimeSlot {
            id: "ls".into(),
            start: "09:00".into(),
            end: Some("09:30".into()),
        }];
        let mut high_load = make_todo("high-load", 2, false, "2026-03-19");
        high_load.time_slots = vec![TimeSlot {
            id: "hs".into(),
            start: "09:00".into(),
            end: Some("12:00".into()),
        }];
        let mut sibling = make_todo("sibling", 2, false, "2026-03-19");
        sibling.time_slots = vec![TimeSlot {
            id: "sib".into(),
            start: "09:30".into(),
            end: Some("11:30".into()),
        }];

        let p_low =
            predict_all(&[low_load], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_high = predict_all(
            &[high_load, sibling],
            &history,
            &[],
            &settings(),
            "2026-03-19",
        )[0]
        .probability;
        assert!(p_low >= p_high);
    }

    #[test]
    fn high_difficulty_and_long_duration_interaction_is_stronger() {
        let mut history = Vec::new();
        for i in 0..4 {
            history.push(make_todo(
                &format!("easy-short-{i}"),
                1,
                true,
                &format!("2026-03-{:02}", 10 + i),
            ));
        }
        for i in 0..4 {
            let mut todo = make_todo(
                &format!("hard-long-{i}"),
                4,
                false,
                &format!("2026-03-{:02}", 15 + i),
            );
            todo.duration_days = 5;
            history.push(todo);
        }
        for i in 0..4 {
            let mut todo = make_todo(
                &format!("easy-long-{i}"),
                1,
                false,
                &format!("2026-03-{:02}", 20 + i),
            );
            todo.duration_days = 5;
            history.push(todo);
        }
        for i in 0..4 {
            history.push(make_todo(
                &format!("hard-short-{i}"),
                4,
                false,
                &format!("2026-03-{:02}", 24 + i),
            ));
        }

        let easy_short = make_todo("easy-short-current", 1, false, "2026-03-19");
        let mut hard_short = make_todo("hard-short-current", 4, false, "2026-03-19");
        let mut easy_long = make_todo("easy-long-current", 1, false, "2026-03-19");
        let mut hard_long = make_todo("hard-long-current", 4, false, "2026-03-19");
        hard_short.duration_days = 1;
        easy_long.duration_days = 5;
        hard_long.duration_days = 5;

        let p_easy_short =
            predict_all(&[easy_short], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_hard_short =
            predict_all(&[hard_short], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_easy_long =
            predict_all(&[easy_long], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_hard_long =
            predict_all(&[hard_long], &history, &[], &settings(), "2026-03-19")[0].probability;

        assert!(p_easy_short >= p_hard_short);
        assert!(p_easy_short >= p_easy_long);
        assert!(p_hard_short >= p_hard_long || p_easy_long >= p_hard_long);
    }

    #[test]
    fn difficulty_changes_probability_even_with_zero_history() {
        let easy = make_todo("easy", 1, false, "2026-03-19");
        let hard = make_todo("hard", 4, false, "2026-03-19");
        let p_easy = predict_all(&[easy], &[], &[], &settings(), "2026-03-19")[0].probability;
        let p_hard = predict_all(&[hard], &[], &[], &settings(), "2026-03-19")[0].probability;
        assert!(
            p_easy > p_hard,
            "easy={p_easy} should be > hard={p_hard} even with no history"
        );
    }

    #[test]
    fn difficulty_changes_probability_with_sparse_uniform_history() {
        let history = vec![
            make_todo("h1", 2, true, "2026-03-17"),
            make_todo("h2", 2, true, "2026-03-18"),
        ];
        let easy = make_todo("easy", 1, false, "2026-03-19");
        let hard = make_todo("hard", 4, false, "2026-03-19");
        let p_easy = predict_all(&[easy], &history, &[], &settings(), "2026-03-19")[0].probability;
        let p_hard = predict_all(&[hard], &history, &[], &settings(), "2026-03-19")[0].probability;
        assert!(
            p_easy > p_hard,
            "easy={p_easy} should be > hard={p_hard} with sparse uniform history"
        );
    }
}
