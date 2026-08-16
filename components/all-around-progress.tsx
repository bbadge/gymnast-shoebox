import { displayGymnasticsLevel } from '@/lib/gymnastics';

type AllAroundProgressProps = {
  level: string | null;
  latestScore: number;
  recentAverage: number;
  recentMeetCount: number;
  personalBest: number;
  gapToBest: number;
  percentOfBest: number;
  levelMeetCount: number;
};

export function AllAroundProgress({
  level,
  latestScore,
  recentAverage,
  recentMeetCount,
  personalBest,
  gapToBest,
  percentOfBest,
  levelMeetCount,
}: AllAroundProgressProps) {
  const recentLabel = recentMeetCount === 1 ? 'Latest complete meet' : `Recent ${recentMeetCount}-meet average`;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">All-Around Progress</h3>
          <p className="text-xs text-muted-foreground">
            {displayGymnasticsLevel(level)} · {levelMeetCount} complete meet{levelMeetCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-muted-foreground">Level best</p>
          <p className="text-xl font-bold text-primary">{personalBest.toFixed(3)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{recentLabel}</p>
          <p className="text-lg font-semibold">{recentAverage.toFixed(3)}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Latest {latestScore.toFixed(3)}</p>
          <p>{gapToBest <= 0.0005 ? 'At personal best' : `${gapToBest.toFixed(3)} from best`}</p>
          <p>{percentOfBest.toFixed(1)}% of level best</p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={`${recentLabel} compared with the personal best at ${displayGymnasticsLevel(level)}`}
        aria-valuemin={0}
        aria-valuemax={personalBest}
        aria-valuenow={Number(recentAverage.toFixed(3))}
        aria-valuetext={`${recentAverage.toFixed(3)} compared with a personal best of ${personalBest.toFixed(3)}`}
        className="mt-2 h-3 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percentOfBest}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        The meter compares complete-meet consistency with the personal best at the current major level.
      </p>
    </div>
  );
}
