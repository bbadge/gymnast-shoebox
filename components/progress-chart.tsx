import { displayGymnasticsLevel } from '@/lib/gymnastics';

type ProgressPoint = {
  label: string;
  score: number;
  level: string | null;
};

export function ProgressChart({ label, points }: { label: string; points: ProgressPoint[] }) {
  if (points.length < 2) return null;

  const width = 560;
  const height = 172;
  const horizontalPadding = 18;
  const topPadding = 42;
  const bottomPadding = 18;
  const values = points.map((point) => point.score);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, 0.5);
  const coordinates = points.map((point, index) => {
    const x =
      horizontalPadding +
      (index / Math.max(points.length - 1, 1)) * (width - horizontalPadding * 2);
    const y =
      height -
      bottomPadding -
      ((point.score - minimum) / spread) * (height - topPadding - bottomPadding);
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
  const improvement = points.at(-1)!.score - points[0].score;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{label}</h3>
        <p className="text-xs text-muted-foreground">
          Best {maximum.toFixed(3)} · {improvement >= 0 ? '+' : ''}{improvement.toFixed(3)} overall
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} score trend with level changes`}
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
              {point.label}: {point.score.toFixed(3)} · {displayGymnasticsLevel(point.level)}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}
