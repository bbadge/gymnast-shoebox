import type { Apparatus } from '@/lib/gymnastics';
import type { ImportedMeet, ImportedScore } from '@/lib/imports/types';

const HEADER_ALIASES = {
  name: ['meetname', 'meet', 'competitionname', 'competition'],
  startDate: ['startdate', 'meetdate', 'date'],
  endDate: ['enddate'],
  level: ['level', 'competitionlevel'],
  event: ['event', 'apparatus'],
  score: ['score', 'value', 'finalscore'],
  place: ['place', 'placement', 'rank'],
  startValue: ['startvalue', 'sv', 'difficulty'],
  allAroundPlace: ['allaroundplace', 'aaplace', 'allaroundplacement'],
  notes: ['notes', 'note'],
} as const;

const APPARATUS_ALIASES: Record<string, Apparatus> = {
  vault: 'vault',
  vt: 'vault',
  bars: 'uneven_bars',
  unevenbars: 'uneven_bars',
  ub: 'uneven_bars',
  beam: 'balance_beam',
  balancebeam: 'balance_beam',
  bb: 'balance_beam',
  floor: 'floor_exercise',
  floorexercise: 'floor_exercise',
  fx: 'floor_exercise',
  pommel: 'pommel_horse',
  pommelhorse: 'pommel_horse',
  ph: 'pommel_horse',
  rings: 'still_rings',
  stillrings: 'still_rings',
  sr: 'still_rings',
  parallelbars: 'parallel_bars',
  pbars: 'parallel_bars',
  pb: 'parallel_bars',
  highbar: 'high_bar',
  horizontalbar: 'high_bar',
  hb: 'high_bar',
};

export type CsvImportPreview = {
  meets: ImportedMeet[];
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function findColumn(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function valueAt(row: string[], column: number) {
  return column >= 0 ? row[column]?.trim() ?? '' : '';
}

function optionalNumber(raw: string, label: string, rowNumber: number) {
  if (!raw) return null;
  const value = Number(raw.replace(/^(?:T|#)/i, '').trim());
  if (!Number.isFinite(value)) throw new Error(`Row ${rowNumber}: ${label} must be a number.`);
  return value;
}

function optionalPlace(raw: string, label: string, rowNumber: number) {
  const value = optionalNumber(raw, label, rowNumber);
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Row ${rowNumber}: ${label} must be a positive whole number.`);
  }
  return value;
}

function calendarDate(raw: string, label: string, rowNumber: number) {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    [, year, month, day] = iso.map(Number);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
  } else {
    throw new Error(`Row ${rowNumber}: ${label} must be YYYY-MM-DD or M/D/YYYY.`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`Row ${rowNumber}: ${label} is not a valid calendar date.`);
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function scoreFor(
  apparatus: Apparatus,
  scoreRaw: string,
  placeRaw: string,
  startValueRaw: string,
  rowNumber: number
): ImportedScore | null {
  const value = optionalNumber(scoreRaw, 'score', rowNumber);
  const place = optionalPlace(placeRaw, 'place', rowNumber);
  const startValue = optionalNumber(startValueRaw, 'start value', rowNumber);
  if (value === null && place === null && startValue === null) return null;
  if (value === null) throw new Error(`Row ${rowNumber}: ${apparatus} needs a score.`);
  if (value < 0 || value > 100) throw new Error(`Row ${rowNumber}: score must be between 0 and 100.`);
  return { apparatus, value, place, startValue };
}

export function parseCsvImports(csv: string): CsvImportPreview {
  if (!csv.trim()) throw new Error('Choose a CSV file that contains meet scores.');
  const rows = parseRows(csv.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one score row.');

  const headers = rows[0].map(normalized);
  const columns = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(headers, aliases)])
  ) as Record<keyof typeof HEADER_ALIASES, number>;
  if (columns.name < 0) throw new Error('Add a Meet Name, Meet, or Competition column.');

  const wideColumns = new Map<Apparatus, number>();
  headers.forEach((header, index) => {
    const apparatus = APPARATUS_ALIASES[header];
    if (apparatus) wideColumns.set(apparatus, index);
  });
  const isLongForm = columns.event >= 0 && columns.score >= 0;
  if (!isLongForm && wideColumns.size === 0) {
    throw new Error('Add Event and Score columns, or use apparatus columns such as Vault, Bars, Beam, and Floor.');
  }

  const grouped = new Map<string, ImportedMeet>();
  const warnings: string[] = [];

  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    const name = valueAt(row, columns.name);
    if (!name) {
      warnings.push(`Skipped row ${rowNumber} because it has no meet name.`);
      return;
    }

    const startDate = calendarDate(valueAt(row, columns.startDate), 'start date', rowNumber);
    const endDate = calendarDate(valueAt(row, columns.endDate), 'end date', rowNumber) ?? startDate;
    if (startDate && endDate && endDate < startDate) {
      throw new Error(`Row ${rowNumber}: end date cannot be before start date.`);
    }

    const key = `${normalized(name)}|${startDate ?? ''}`;
    const meet = grouped.get(key) ?? {
      provider: 'csv' as const,
      sourceId: null,
      name,
      level: valueAt(row, columns.level) || null,
      startDate,
      endDate,
      allAroundPlace: optionalPlace(
        valueAt(row, columns.allAroundPlace),
        'all-around place',
        rowNumber
      ),
      notes: valueAt(row, columns.notes) || null,
      scores: [],
    };

    const scores: ImportedScore[] = [];
    if (isLongForm) {
      const event = normalized(valueAt(row, columns.event));
      if (event === 'aa' || event === 'allaround') {
        meet.allAroundPlace = optionalPlace(valueAt(row, columns.place), 'all-around place', rowNumber);
      } else {
        const apparatus = APPARATUS_ALIASES[event];
        if (!apparatus) {
          warnings.push(`Skipped row ${rowNumber}: unrecognized event “${valueAt(row, columns.event)}”.`);
        } else {
          const score = scoreFor(
            apparatus,
            valueAt(row, columns.score),
            valueAt(row, columns.place),
            valueAt(row, columns.startValue),
            rowNumber
          );
          if (score) scores.push(score);
        }
      }
    } else {
      wideColumns.forEach((column, apparatus) => {
        const score = scoreFor(apparatus, valueAt(row, column), '', '', rowNumber);
        if (score) scores.push(score);
      });
    }

    scores.forEach((score) => {
      const existingIndex = meet.scores.findIndex((item) => item.apparatus === score.apparatus);
      if (existingIndex >= 0) meet.scores[existingIndex] = score;
      else meet.scores.push(score);
    });
    grouped.set(key, meet);
  });

  const meets = Array.from(grouped.values()).filter((meet) => {
    if (meet.scores.length > 0) return true;
    warnings.push(`Skipped ${meet.name} because it has no recognizable event scores.`);
    return false;
  });
  if (meets.length === 0) throw new Error('No importable meet scores were found in the CSV.');
  if (meets.length > 100) throw new Error('Import at most 100 meets at a time.');
  return { meets, warnings };
}
