import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  Locale,
  PredictionConfidence,
  PredictionFactor,
  PredictionFactorDirection,
  PredictionFactorKind,
  PredictionResult,
} from "@/types";

function interpolateColor(probability: number): string {
  const p = Math.max(0, Math.min(1, probability));
  if (p < 0.5) {
    const ratio = p / 0.5;
    const r = Math.round(239 + (245 - 239) * ratio);
    const g = Math.round(68 + (158 - 68) * ratio);
    const b = Math.round(68 + (11 - 68) * ratio);
    return `rgb(${r},${g},${b})`;
  }
  const ratio = (p - 0.5) / 0.5;
  const r = Math.round(245 + (34 - 245) * ratio);
  const g = Math.round(158 + (197 - 158) * ratio);
  const b = Math.round(11 + (94 - 11) * ratio);
  return `rgb(${r},${g},${b})`;
}

export function formatPredictionPercent(
  probability: number,
  confidence: PredictionConfidence,
): string {
  const prefix = confidence === "low" ? "~" : "";
  return `${prefix}${(probability * 100).toFixed(1)}%`;
}

export function getPredictionConfidenceLabel(
  confidence: PredictionConfidence,
  locale: Locale,
): string {
  return t(`predict.confidence.${confidence}`, locale);
}

export function getPredictionFactorLabel(kind: PredictionFactorKind, locale: Locale): string {
  return t(`predict.factor.${kind}`, locale);
}

function getPredictionFactorDirectionLabel(
  direction: PredictionFactorDirection,
  locale: Locale,
): string {
  return t(`predict.direction.${direction}`, locale);
}

export function formatPredictionFactor(factor: PredictionFactor, locale: Locale): string {
  return `${getPredictionFactorLabel(factor.kind, locale)} · ${getPredictionFactorDirectionLabel(
    factor.direction,
    locale,
  )}`;
}

function buildPredictionTitle(prediction: PredictionResult, locale: Locale): string {
  const lines = [
    t("predict.tooltip", locale),
    `${t("predict.on_time_probability", locale)}: ${formatPredictionPercent(
      prediction.probability,
      prediction.confidence,
    )}`,
    `${t("predict.confidence", locale)}: ${getPredictionConfidenceLabel(
      prediction.confidence,
      locale,
    )}`,
    t("predict.samples", locale, { n: prediction.effectiveSampleSize.toFixed(1) }),
  ];
  for (const factor of prediction.factors.slice(0, 3)) {
    lines.push(
      `${formatPredictionFactor(factor, locale)} · ${factor.impact > 0 ? "+" : ""}${(
        factor.impact * 100
      ).toFixed(1)}pp`,
    );
  }
  return lines.join("\n");
}

export function PredictionBadge({
  prediction,
  variant = "compact",
}: {
  prediction: PredictionResult;
  variant?: "compact" | "detail";
}) {
  const locale = useSettingsStore((s) => s.locale);
  const pctLabel = formatPredictionPercent(prediction.probability, prediction.confidence);
  const color = interpolateColor(prediction.probability);

  const size = variant === "detail" ? 18 : 16;
  const stroke = variant === "detail" ? 2.25 : 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - prediction.probability);
  const containerClass =
    variant === "detail"
      ? "inline-flex shrink-0 items-center gap-1.5 leading-none"
      : "inline-flex shrink-0 items-center gap-0.5 leading-none";
  const textClass =
    variant === "detail"
      ? "text-[14px] font-semibold leading-none tabular-nums text-text-3"
      : "text-[13px] font-medium leading-none tabular-nums text-text-3";

  return (
    <span
      className={containerClass}
      title={buildPredictionTitle(prediction, locale)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={textClass} style={{ color }}>
        {pctLabel}
      </span>
    </span>
  );
}
