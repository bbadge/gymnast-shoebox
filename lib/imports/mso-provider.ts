import * as cheerio from 'cheerio';
import { parseMsoDateRange } from '@/lib/mso';
import type {
  ImportedMeet,
  ImportMeetSummary,
  MeetImportProvider,
} from '@/lib/imports/types';
import type { Apparatus } from '@/lib/gymnastics';

const MSO_ORIGIN = 'https://www.meetscoresonline.com';
const MSO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
};

const APPARATUS_MAP: Record<string, Apparatus> = {
  Floor: 'floor_exercise',
  'Floor Exercise': 'floor_exercise',
  Pommel: 'pommel_horse',
  'Pommel Horse': 'pommel_horse',
  Rings: 'still_rings',
  'Still Rings': 'still_rings',
  Vault: 'vault',
  PBars: 'parallel_bars',
  'P Bars': 'parallel_bars',
  'Parallel Bars': 'parallel_bars',
  HiBar: 'high_bar',
  'High Bar': 'high_bar',
  'Horizontal Bar': 'high_bar',
  Beam: 'balance_beam',
  Bars: 'uneven_bars',
  'Uneven Bars': 'uneven_bars',
};

function safeMeetUrl(meetId: string) {
  if (!/^\/results\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(meetId)) {
    throw new Error('Invalid MSO meet identifier.');
  }
  return new URL(meetId, MSO_ORIGIN).toString();
}

export function createMsoProvider(athleteId: string): MeetImportProvider {
  return {
    id: 'mso',

    async listMeets() {
      const response = await fetch(
        `${MSO_ORIGIN}/Athlete.MyScores/${encodeURIComponent(athleteId)}`,
        { cache: 'no-store', headers: MSO_HEADERS }
      );
      if (!response.ok) throw new Error(`MSO returned status ${response.status}.`);

      const $ = cheerio.load(await response.text());
      const meets = new Map<string, ImportMeetSummary>();

      $('a[href^="/results/"]').each((_index, element) => {
        const link = $(element);
        const id = link.attr('href');
        const columns = link.closest('tr').find('td');
        if (!id || columns.length === 0) return;

        const name = $(columns[0]).text().trim() || link.text().trim();
        const level = $(columns[2]).text().trim();
        const dateStr = $(columns[4]).text().trim() || 'Date TBD';
        if (name && name !== level) {
          meets.set(id, { provider: 'mso', id, name, level, dateStr, isImported: false });
        }
      });

      return Array.from(meets.values());
    },

    async fetchMeet(meet) {
      if (meet.provider !== 'mso') throw new Error('This meet is not an MSO import.');
      const response = await fetch(safeMeetUrl(meet.id), {
        cache: 'no-store',
        headers: MSO_HEADERS,
      });
      if (!response.ok) throw new Error(`MSO returned status ${response.status}.`);

      const $ = cheerio.load(await response.text());
      const name = $('h1.event-title').text().trim() || meet.name;
      const rawDate = $('#MeetDetails h5 strong').first().text().trim() || meet.dateStr;
      const scores: ImportedMeet['scores'] = [];
      let allAroundPlace: number | null = null;

      $('#athlete table tbody tr').each((_index, row) => {
        const eventLabel = $(row).find('th').text().trim();
        const value = Number.parseFloat($(row).find('span.score').text().trim());
        const place = Number.parseInt($(row).find('span.place').text().replace('T', ''), 10);

        if (eventLabel === 'AA') {
          if (!Number.isNaN(place)) allAroundPlace = place;
          return;
        }

        const apparatus = APPARATUS_MAP[eventLabel];
        if (apparatus && !Number.isNaN(value)) {
          scores.push({
            apparatus,
            value,
            place: Number.isNaN(place) ? null : place,
            fieldSize: null,
            startValue: null,
          });
        }
      });

      if (scores.length === 0) throw new Error('MSO returned no recognizable event scores.');
      const { startDate, endDate } = parseMsoDateRange(rawDate);
      return {
        provider: 'mso',
        sourceId: meet.id,
        name,
        level: meet.level || null,
        startDate,
        endDate,
        allAroundPlace,
        notes: null,
        scores,
      };
    },
  };
}
