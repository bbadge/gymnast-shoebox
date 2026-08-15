const MONTHS = new Map(
  [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ].map((month, index) => [month, index + 1])
);

function dateOnly(value: string, fallbackYear?: string) {
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (!match) return null;

  const month = MONTHS.get(match[1].toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3] ?? fallbackYear);
  if (!month || !year || day < 1 || day > 31) return null;

  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() + 1 !== month ||
    validationDate.getUTCDate() !== day
  ) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseMsoDateRange(raw: string) {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === 'Date TBD') return { startDate: null, endDate: null };

  const year = cleaned.match(/\b(20\d{2})\b/)?.[1];
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length === 1) {
    const date = dateOnly(parts[0], year);
    return { startDate: date, endDate: date };
  }

  return {
    startDate: dateOnly(parts[0], year),
    endDate: dateOnly(parts.at(-1) ?? '', year),
  };
}
