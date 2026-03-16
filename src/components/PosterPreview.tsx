import { forwardRef } from "react";
import { Check } from "lucide-react";
import { DIFFICULTY_CONFIG, formatTimeSlots, hexToRgba } from "@/lib/utils";
import { t } from "@/i18n";
import type { Todo, Locale } from "@/types";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Props {
  title: string;
  dateLabel: string;
  todos: Todo[];
  tags: Tag[];
  locale: Locale;
  theme: "dark" | "light";
}

function LogoSvg({ dark }: { dark: boolean }) {
  const fill = dark ? "#050505" : "#F5F5F5";
  const stroke = dark ? "#F5F5F5" : "#18181b";
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="24" y="24" width="464" height="464" rx="120" fill={fill} />
      <g
        transform="translate(12 0)"
        stroke={stroke}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M118 148H286" />
        <path d="M118 220H378" />
        <rect x="116" y="290" width="76" height="76" rx="24" />
        <path d="M228 328L270 370L378 262" />
      </g>
    </svg>
  );
}

export const PosterPreview = forwardRef<HTMLDivElement, Props>(
  ({ title, dateLabel, todos, tags, locale, theme }, ref) => {
    const sorted = [...todos].sort((a, b) => a.order - b.order);
    const active = sorted.filter((td) => !td.completed);
    const completed = sorted.filter((td) => td.completed);

    const isDark = theme === "dark";
    const bg = isDark
      ? "linear-gradient(160deg, #1a1b2e 0%, #0f1021 50%, #1a1b2e 100%)"
      : "linear-gradient(160deg, #f8f9fc 0%, #eef0f8 50%, #f8f9fc 100%)";
    const textPrimary = isDark ? "#e4e4e7" : "#18181b";
    const textSecondary = isDark ? "#a1a1aa" : "#71717a";
    const textMuted = isDark ? "#71717a" : "#a1a1aa";
    const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const accentColor = "#6366f1";

    return (
      <div
        ref={ref}
        style={{
          width: 480,
          padding: 32,
          background: bg,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          color: textPrimary,
        }}
      >
        {/* Header + inline stats */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 4,
                height: 24,
                background: accentColor,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: textPrimary,
              }}
            >
              {title}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginLeft: 14,
              fontSize: 12,
              color: textSecondary,
            }}
          >
            <span>{dateLabel}</span>
            <span style={{ color: borderColor }}>|</span>
            <span>
              <strong style={{ color: accentColor }}>{todos.length}</strong>{" "}
              {t("poster.total", locale)}
              {" · "}
              <strong style={{ color: "#22c55e" }}>{completed.length}</strong>{" "}
              {t("poster.done", locale)}
              {" · "}
              <strong style={{ color: textPrimary }}>{active.length}</strong>{" "}
              {t("poster.pending", locale)}
            </span>
          </div>
        </div>

        {/* Active tasks */}
        {active.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {active.map((td, i) => (
              <PosterTask
                key={td.id}
                todo={td}
                tags={tags}
                locale={locale}
                index={i + 1}
                done={false}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                textMuted={textMuted}
                borderColor={borderColor}
                accentColor={accentColor}
              />
            ))}
          </div>
        )}

        {/* Completed tasks */}
        {completed.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "10px 0",
              }}
            >
              <div style={{ flex: 1, height: 1, background: borderColor }} />
              <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>
                {t("todo.completed_sep", locale, { n: completed.length })}
              </span>
              <div style={{ flex: 1, height: 1, background: borderColor }} />
            </div>
            {completed.map((td) => (
              <PosterTask
                key={td.id}
                todo={td}
                tags={tags}
                locale={locale}
                done
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                textMuted={textMuted}
                borderColor={borderColor}
                accentColor={accentColor}
              />
            ))}
          </div>
        )}

        {/* Footer brand */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            paddingTop: 12,
            borderTop: `1px solid ${borderColor}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <LogoSvg dark={isDark} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: accentColor,
                letterSpacing: "-0.01em",
              }}
            >
              TinyDo
            </span>
          </div>
          <span style={{ fontSize: 11, color: textMuted }}>{t("poster.watermark", locale)}</span>
        </div>
      </div>
    );
  },
);

PosterPreview.displayName = "PosterPreview";

function PosterTask({
  todo,
  tags,
  locale,
  index,
  done,
  textPrimary,
  textSecondary,
  textMuted,
  borderColor,
  accentColor,
}: {
  todo: Todo;
  tags: Tag[];
  locale: Locale;
  index?: number;
  done: boolean;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderColor: string;
  accentColor: string;
}) {
  const diff = DIFFICULTY_CONFIG[todo.difficulty];
  const todoTags = tags.filter((tg) => todo.tagIds.includes(tg.id));
  const time = formatTimeSlots(todo.timeSlots);
  const subs = todo.subtasks;
  const doneCount = subs.filter((st) => st.completed).length;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 0",
        borderBottom: `1px solid ${borderColor}`,
        opacity: done ? 0.55 : 1,
      }}
    >
      {/* Checkbox visual */}
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        {done ? (
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={10} color="white" strokeWidth={3} />
          </div>
        ) : (
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              border: `2px solid ${textMuted}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {index !== undefined && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: index <= 3 ? accentColor : textMuted,
                }}
              >
                {index}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.4,
            color: textPrimary,
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {todo.title}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 4,
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: diff.color,
              padding: "1px 6px",
              background: hexToRgba(diff.color, 0.1),
              borderRadius: 3,
            }}
          >
            {t(`diff.${todo.difficulty}`, locale)}
          </span>
          {time && <span style={{ fontSize: 12, color: textSecondary }}>{time}</span>}
          {todoTags.map((tg) => (
            <span
              key={tg.id}
              style={{
                fontSize: 12,
                color: tg.color,
                padding: "1px 6px",
                background: hexToRgba(tg.color, 0.1),
                borderRadius: 3,
              }}
            >
              {tg.name}
            </span>
          ))}
          {subs.length > 0 && (
            <span style={{ fontSize: 12, color: textSecondary }}>
              {t("subtask.count", locale, { done: doneCount, total: subs.length })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
