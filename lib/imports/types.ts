import type { Apparatus } from '@/lib/gymnastics';

export type ImportProviderId = 'mso' | 'csv';

export type ImportMeetSummary = {
  provider: ImportProviderId;
  id: string;
  name: string;
  dateStr: string;
  level: string;
  isImported: boolean;
};

export type ImportedScore = {
  apparatus: Apparatus;
  value: number;
  place: number | null;
  fieldSize: number | null;
  startValue: number | null;
};

export type ImportedMeet = {
  provider: ImportProviderId;
  sourceId: string | null;
  name: string;
  level: string | null;
  startDate: string | null;
  endDate: string | null;
  allAroundPlace: number | null;
  notes: string | null;
  scores: ImportedScore[];
};

export type ImportBatchSummary = {
  id: string;
  sourceName: string;
  meetCount: number;
  createdAt: string;
};

export interface MeetImportProvider {
  readonly id: ImportProviderId;
  listMeets(): Promise<ImportMeetSummary[]>;
  fetchMeet(summary: ImportMeetSummary): Promise<ImportedMeet>;
}
