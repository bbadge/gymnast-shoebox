'use client';

import { useState } from 'react';
import { displayGymnasticsLevel } from '@/lib/gymnastics';

type ProgressPoint = {
  label: string;
  score: number;
  fieldPercentile: number | null;
  level: string | null;
};

export function ProgressChart({ label, points }: { label: string; points: ProgressPoint[] }) {
  const [metric, setMetric] = useState<'score' | 'field'>('score');
  if (points.length < 2) return null;

  const fieldPoints = points.filter((point) => point.fieldPercentile !== null);
  const chartPoints = (metric === 'field' ? fieldPoints : points).map((point) => ({
    ...point,
    value: metric === 'field' ? point.fieldPercentile! : point.score,
  }));
  const width = 560;
  const height = 172;
  const horizontalPadding = 18;
  const topPadding = 42;
  const bottomPadding = 18;
  const values = chartPoints.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, metric === 'field' ? 10 : 0.5);
  const scaleMinimum = minimum - (spread - (maximum - minimum)) / 2;
  const coordinates = chartPoints.map((point, index) => {
    const x =
      horizontalPadding +
      (index / Math.max(chartPoints.length - 1, 1)) * (width - horizontalPadding * 2);
    const y =
      height -
      bottomPadding -
      ((point.value - scaleMinimum) / spread) * (height - topPadding - bottomPadding);
    return { ...point, x, y };
  });
  const levelSections = coordinates.reduce<
    Array<{ level: string | null; startIndex: number; endIndex: number }>
  >((sections, point, index) => {
    const current = sections.at(-1);
    if (!current || current.level !== point.level) {
      sections.push({ level: point.level, startIndex: index, endIndex: index });
    } else {
      current.endIndex = index;
    }
    return sections;
  }, []);
  const improvement = chartPoints.at(-1)!.value - chartPoints[0].value;
  const formatValue = (value: number) => metric === 'field' ? `${Math.round(value)}` : value.toFixed(3);
  const summary = metric === 'field'
    ? `Best percentile ${formatValue(maximum)} · ${improvement >= 0 ? '+' : ''}${formatValue(improvement)} points overall · ${fieldPoints.length} meets`
    : `Best ${formatValue(maximum)} · ${improvement >= 0 ? '+' : ''}${formatValue(improvement)} overall`;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{label}</h3>
        <div className="flex items-center gap-1 rounded-md border p-0.5 text-xs">
          <button
            type="button"
            aria-pressed={metric === 'score'}
            onClick={() => setMetric('score')}
            className={`rounded px-2 py-1 ${metric === 'score' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            Score
          </button>
          <button
            type="button"
            aria-pressed={metric === 'field'}
            disabled={fieldPoints.length < 2}
            title={fieldPoints.length < 2 ? 'Add field size to at least two placements' : undefined}
            aria-label={fieldPoints.length < 2 ? 'Field percentile unavailable until two placements include field size' : 'Show field percentile trend'}
            onClick={() => setMetric('field')}
            className={`rounded px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${metric === 'field' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            Field percentile
          </button>
        </div>
        <p className="w-full text-xs text-muted-foreground">
          {summary}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} ${metric === 'field' ? 'field percentile' : 'score'} trend with level changes`}
        className="h-40 w-full overflow-visible"
      >
        {levelSections.map((section, index) => {
          const previousPoint = coordinates[section.startIndex - 1];
          const firstPoint = coordinates[section.startIndex];
          const lastPoint = coordinates[section.endIndex];
          const startX = previousPoint
            ? (previousPoint.x + firstPoint.x) / 2
            : horizontalPadding;
          const nextPoint = coordinates[section.endIndex + 1];
          const endX = nextPoint ? (lastPoint.x + nextPoint.x) / 2 : width - horizontalPadding;

          return (
            <g key={`${section.level ?? 'unknown'}-${section.startIndex}`}>
              {index > 0 ? (
                <line
                  x1={startX}
                  y1="24"
                  x2={startX}
                  y2={height - bottomPadding}
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  className="stroke-muted-foreground/70"
                />
              ) : null}
              <text
                x={(startX + endX) / 2}
                y="15"
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] font-semibold"
              >
                {displayGymnasticsLevel(section.level)}
              </text>
            </g>
          );
        })}
        <line
          x1={horizontalPadding}
          y1={height - bottomPadding}
          x2={width - horizontalPadding}
          y2={height - bottomPadding}
          className="stroke-border"
        />
        <polyline
          points={coordinates.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-primary"
        />
        {coordinates.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="4" fill="currentColor" className="text-secondary" />
            <title>
              {point.label}: {metric === 'field' ? `field percentile ${formatValue(point.value)}` : formatValue(point.value)} · {displayGymnasticsLevel(point.level)}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}
