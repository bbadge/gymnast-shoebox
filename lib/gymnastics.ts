export const APPARATUSES = [
  'vault',
  'uneven_bars',
  'balance_beam',
  'floor_exercise',
  'pommel_horse',
  'still_rings',
  'parallel_bars',
  'high_bar',
] as const;

export type Apparatus = (typeof APPARATUSES)[number];
export type GymnastProgram = 'female' | 'male';

export const APPARATUS_LABELS: Record<Apparatus, string> = {
  vault: 'Vault',
  uneven_bars: 'Bars',
  balance_beam: 'Beam',
  floor_exercise: 'Floor',
  pommel_horse: 'Pommel',
  still_rings: 'Rings',
  parallel_bars: 'P Bars',
  high_bar: 'High Bar',
};

export const PROGRAM_APPARATUSES: Record<GymnastProgram, Apparatus[]> = {
  female: ['vault', 'uneven_bars', 'balance_beam', 'floor_exercise'],
  male: [
    'floor_exercise',
    'pommel_horse',
    'still_rings',
    'vault',
    'parallel_bars',
    'high_bar',
  ],
};

export function displayApparatus(apparatus: string) {
  return APPARATUS_LABELS[apparatus as Apparatus] ?? apparatus.replaceAll('_', ' ');
}

export function apparatusForProgram(program?: string | null) {
  return PROGRAM_APPARATUSES[program === 'male' ? 'male' : 'female'];
}

export function formatCalendarDate(date: string | null, fallback = 'Date TBD') {
  if (!date) return fallback;
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return fallback;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function competitionSeason(date: string | null) {
  if (!date) return 'Unscheduled';

  const [year, month] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month) return 'Unscheduled';

  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function majorGymnasticsLevel(level: string | null) {
  if (!level) return null;

  const numericLevel = level.match(/\b(?:level\s*)?(\d+)\b/i)?.[1];
  if (numericLevel) return numericLevel;

  const xcelLevel = level.match(/\b(bronze|silver|gold|platinum|diamond|sapphire)\b/i)?.[1];
  if (xcelLevel) {
    return `Xcel ${xcelLevel.charAt(0).toUpperCase()}${xcelLevel.slice(1).toLowerCase()}`;
  }

  return level.trim() || null;
}

export function displayGymnasticsLevel(level: string | null) {
  if (!level) return 'Level not recorded';
  return /^(?:level|xcel)\b/i.test(level) ? level : `Level ${level}`;
}

export function placementPercentile(place?: number | null, fieldSize?: number | null) {
  if (!place || !fieldSize || fieldSize < 2 || place > fieldSize) return null;
  return Math.round(((fieldSize - place) / (fieldSize - 1)) * 100);
}

export function displayPlacementPercentile(place?: number | null, fieldSize?: number | null) {
  const percentile = placementPercentile(place, fieldSize);
  if (percentile === null) return null;
  const remainder = percentile % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? 'th'
    : percentile % 10 === 1
      ? 'st'
      : percentile % 10 === 2
        ? 'nd'
        : percentile % 10 === 3
          ? 'rd'
          : 'th';
  return `${percentile}${suffix} field percentile`;
}
