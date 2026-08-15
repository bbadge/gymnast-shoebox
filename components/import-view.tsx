'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  Check,
  CloudDownload,
  FileSpreadsheet,
  History,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { linkMsoAthlete } from '@/app/actions/gymnast';
import { checkCsvImport, importCsvBatch, undoCsvImport } from '@/app/actions/imports';
import { fetchMsoMeets, syncMsoMeet, type MsoMeetSummary } from '@/app/actions/mso';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { displayApparatus, formatCalendarDate } from '@/lib/gymnastics';
import {
  analyzeCsv,
  parseCsvImports,
  type CsvColumnMapping,
  type CsvMappingField,
} from '@/lib/imports/csv';
import type { ImportBatchSummary, ImportedMeet } from '@/lib/imports/types';
import { toast } from 'sonner';

const CSV_TEMPLATE = [
  'Meet Name,Date,Level,Event,Score,Place,Start Value,All Around Place,Notes',
  'Example Invitational,2/14/2026,4,Vault,9.125,3,,2,Optional note',
  'Example Invitational,2/14/2026,4,Bars,8.950,5,,,',
  'Example Invitational,2/14/2026,4,Beam,9.200,2,,,',
  'Example Invitational,2/14/2026,4,Floor,9.300,1,,,',
].join('\n');

const MAPPING_FIELDS: { field: CsvMappingField; label: string; required?: boolean }[] = [
  { field: 'name', label: 'Meet name', required: true },
  { field: 'startDate', label: 'Start date' },
  { field: 'endDate', label: 'End date' },
  { field: 'level', label: 'Level' },
  { field: 'event', label: 'Event' },
  { field: 'score', label: 'Score' },
  { field: 'place', label: 'Place' },
  { field: 'startValue', label: 'Start value' },
  { field: 'allAroundPlace', label: 'All-around place' },
  { field: 'notes', label: 'Notes' },
];

function meetKey(meet: Pick<ImportedMeet, 'name' | 'startDate'>) {
  return `${meet.name.trim().toLowerCase()}|${meet.startDate ?? ''}`;
}

function formatImportTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function ImportView({
  gymnastName,
  initialMsoId,
  initialImportBatches,
}: {
  gymnastName: string;
  initialMsoId?: string | null;
  initialImportBatches: ImportBatchSummary[];
}) {
  const [msoId, setMsoId] = useState(initialMsoId || '');
  const [isLinked, setIsLinked] = useState(Boolean(initialMsoId));
  const [meets, setMeets] = useState<MsoMeetSummary[]>([]);
  const [csvText, setCsvText] = useState('');
  const [csvSourceName, setCsvSourceName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping | null>(null);
  const [csvMeets, setCsvMeets] = useState<ImportedMeet[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [duplicateCsvKeys, setDuplicateCsvKeys] = useState<string[]>([]);
  const [importedCsvKeys, setImportedCsvKeys] = useState<string[]>([]);
  const [importBatches, setImportBatches] = useState(initialImportBatches);
  const [isPending, startTransition] = useTransition();
  const csvCheckVersion = useRef(0);

  const loadMeets = useCallback(() => {
    startTransition(async () => {
      const result = await fetchMsoMeets();
      if (result.error) toast.error(result.error);
      else if (result.meets) setMeets(result.meets);
    });
  }, []);

  useEffect(() => {
    if (initialMsoId) loadMeets();
  }, [initialMsoId, loadMeets]);

  const linkAndLoad = () => {
    startTransition(async () => {
      const result = await linkMsoAthlete(msoId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setIsLinked(true);
      toast.success(`${gymnastName} is now linked to MSO.`);
      const meetsResult = await fetchMsoMeets();
      if (meetsResult.error) toast.error(meetsResult.error);
      else if (meetsResult.meets) setMeets(meetsResult.meets);
    });
  };

  const syncMeet = (meet: MsoMeetSummary) => {
    startTransition(async () => {
      const result = await syncMsoMeet(meet);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.updated ? 'Meet updated from MSO.' : 'Meet imported from MSO.');
      setMeets((current) =>
        current.map((item) => (item.id === meet.id ? { ...item, isImported: true } : item))
      );
    });
  };

  const updateCsvPreview = (text: string, mapping: CsvColumnMapping) => {
    const checkVersion = csvCheckVersion.current + 1;
    csvCheckVersion.current = checkVersion;
    try {
      const preview = parseCsvImports(text, mapping);
      setCsvMeets(preview.meets);
      setCsvWarnings(preview.warnings);
      setDuplicateCsvKeys([]);
      setImportedCsvKeys([]);

      startTransition(async () => {
        const result = await checkCsvImport(preview.meets);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (csvCheckVersion.current === checkVersion) {
          setDuplicateCsvKeys(result.duplicateKeys ?? []);
        }
      });
    } catch (error) {
      setCsvMeets([]);
      setCsvWarnings([]);
      setDuplicateCsvKeys([]);
      toast.error(error instanceof Error ? error.message : 'Unable to read that CSV.');
    }
  };

  const previewCsv = async (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error('Choose a CSV smaller than 2 MB. That is already a heroic number of meets.');
      return;
    }

    try {
      const text = await file.text();
      const analysis = analyzeCsv(text);
      setCsvText(text);
      setCsvSourceName(file.name);
      setCsvHeaders(analysis.headers);
      setCsvMapping(analysis.suggestedMapping);
      updateCsvPreview(text, analysis.suggestedMapping);
      toast.success(`Read ${analysis.rowCount} score row${analysis.rowCount === 1 ? '' : 's'}. Review the mapping and meets below.`);
    } catch (error) {
      setCsvText('');
      setCsvHeaders([]);
      setCsvMapping(null);
      setCsvMeets([]);
      setCsvWarnings([]);
      toast.error(error instanceof Error ? error.message : 'Unable to read that CSV.');
    }
  };

  const changeMapping = (field: CsvMappingField, column: number) => {
    if (!csvMapping) return;
    const next = { ...csvMapping, [field]: column };
    setCsvMapping(next);
    updateCsvPreview(csvText, next);
  };

  const importableMeets = csvMeets.filter(
    (meet) => !duplicateCsvKeys.includes(meetKey(meet)) && !importedCsvKeys.includes(meetKey(meet))
  );

  const importAllCsv = () => {
    if (importableMeets.length === 0) return;
    startTransition(async () => {
      const result = await importCsvBatch(csvSourceName, importableMeets);
      if (result.error) {
        if (result.duplicateKeys) setDuplicateCsvKeys(result.duplicateKeys);
        toast.error(result.error);
        return;
      }
      if (!result.batch) return;
      setImportedCsvKeys(importableMeets.map(meetKey));
      setImportBatches((current) => [result.batch, ...current].slice(0, 5));
      toast.success(`Imported ${result.batch.meetCount} meet${result.batch.meetCount === 1 ? '' : 's'} as one reversible batch.`);
    });
  };

  const undoBatch = (batch: ImportBatchSummary) => {
    if (!window.confirm(`Remove all ${batch.meetCount} meets imported from ${batch.sourceName}?`)) return;
    startTransition(async () => {
      const result = await undoCsvImport(batch.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setImportBatches((current) => current.filter((item) => item.id !== batch.id));
      setImportedCsvKeys([]);
      toast.success(`Removed ${result.deletedCount} imported meet${result.deletedCount === 1 ? '' : 's'}.`);
      if (csvMeets.length > 0) {
        const check = await checkCsvImport(csvMeets);
        if (!check.error) setDuplicateCsvKeys(check.duplicateKeys ?? []);
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Import Scores</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sync MSO or import a score file for {gymnastName}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isLinked ? 'MSO account linked' : `Link ${gymnastName} to MSO`}</CardTitle>
          <CardDescription>
            {isLinked
              ? `Athlete ID ${msoId} is saved to ${gymnastName}'s profile.`
              : 'Enter the Athlete ID once. It will be saved and used automatically afterward.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {!isLinked && (
            <div className="grid w-full max-w-sm gap-1.5">
              <Label htmlFor="msoId">Athlete ID</Label>
              <Input
                id="msoId"
                inputMode="numeric"
                value={msoId}
                onChange={(event) => setMsoId(event.target.value)}
              />
            </div>
          )}
          <Button onClick={isLinked ? loadMeets : linkAndLoad} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isLinked ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            {isLinked ? 'Check MSO Now' : 'Link and Sync'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> CSV file
          </CardTitle>
          <CardDescription>
            Match the file&apos;s columns, review duplicate warnings, then import every new meet in one reversible batch. The original file is not retained.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid w-full max-w-md gap-1.5">
              <Label htmlFor="scoreCsv">Score CSV</Label>
              <Input
                id="scoreCsv"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void previewCsv(event.target.files?.[0])}
                disabled={isPending}
              />
            </div>
            <Button variant="outline" asChild>
              <a
                download="gymnast-shoebox-import-template.csv"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
              >
                <CloudDownload className="mr-2 h-4 w-4" /> Download template
              </a>
            </Button>
          </div>

          {csvMapping && csvHeaders.length > 0 && (
            <div className="rounded-lg border p-4">
              <div className="mb-3">
                <p className="font-medium">Column mapping</p>
                <p className="text-sm text-muted-foreground">
                  We guessed these. Correct anything the source labeled creatively.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MAPPING_FIELDS.map(({ field, label, required }) => (
                  <div className="grid gap-1.5" key={field}>
                    <Label htmlFor={`mapping-${field}`}>
                      {label}{required ? ' *' : ''}
                    </Label>
                    <select
                      id={`mapping-${field}`}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={csvMapping[field]}
                      onChange={(event) => changeMapping(field, Number(event.target.value))}
                    >
                      <option value={-1}>Not included</option>
                      {csvHeaders.map((header, index) => (
                        <option value={index} key={`${header}-${index}`}>{header || `Column ${index + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {csvWarnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Import notes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {csvWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          {csvMeets.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Review before importing</p>
                  <p className="text-sm text-muted-foreground">
                    {importableMeets.length} new · {duplicateCsvKeys.length} already in the archive
                  </p>
                </div>
                <Button onClick={importAllCsv} disabled={isPending || importableMeets.length === 0}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Import {importableMeets.length} new meet{importableMeets.length === 1 ? '' : 's'}
                </Button>
              </div>

              {csvMeets.map((meet) => {
                const key = meetKey(meet);
                const duplicate = duplicateCsvKeys.includes(key);
                const imported = importedCsvKeys.includes(key);
                return (
                  <div key={key} className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{meet.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatCalendarDate(meet.startDate)} · Level {meet.level || 'TBD'} · {meet.scores.length} events
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meet.scores.map((score) => `${displayApparatus(score.apparatus)} ${score.value.toFixed(3)}`).join(' · ')}
                      </p>
                    </div>
                    <span className={`text-sm font-medium ${duplicate ? 'text-amber-600 dark:text-amber-400' : imported ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      {duplicate ? 'Already exists' : imported ? 'Imported' : 'Ready'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {importBatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Recent CSV imports</CardTitle>
            <CardDescription>Undo removes only meets created by that import batch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {importBatches.map((batch) => (
              <div key={batch.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{batch.sourceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {batch.meetCount} meet{batch.meetCount === 1 ? '' : 's'} · {formatImportTime(batch.createdAt)}
                  </p>
                </div>
                <Button variant="outline" onClick={() => undoBatch(batch)} disabled={isPending}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Undo import
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {meets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>MSO Meets</CardTitle>
            <CardDescription>Imported meets can be refreshed when MSO posts corrections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {meets.map((meet) => (
              <div key={meet.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-semibold">{meet.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {meet.dateStr} · Level {meet.level || 'TBD'}
                  </p>
                </div>
                <Button
                  variant={meet.isImported ? 'outline' : 'default'}
                  onClick={() => syncMeet(meet)}
                  disabled={isPending}
                >
                  {meet.isImported ? <RefreshCw className="mr-2 h-4 w-4" /> : <CloudDownload className="mr-2 h-4 w-4" />}
                  {meet.isImported ? 'Refresh' : 'Import'}
                </Button>
              </div>
            ))}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" /> Your meet notes are preserved during refreshes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
