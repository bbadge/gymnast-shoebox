'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Check,
  CloudDownload,
  FileSpreadsheet,
  Link2,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { linkMsoAthlete } from '@/app/actions/gymnast';
import { importCsvMeet } from '@/app/actions/imports';
import {
  fetchMsoMeets,
  syncMsoMeet,
  type MsoMeetSummary,
} from '@/app/actions/mso';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { displayApparatus, formatCalendarDate } from '@/lib/gymnastics';
import { parseCsvImports } from '@/lib/imports/csv';
import type { ImportedMeet } from '@/lib/imports/types';
import { toast } from 'sonner';

const CSV_TEMPLATE = [
  'Meet Name,Date,Level,Event,Score,Place,Start Value,All Around Place,Notes',
  'Example Invitational,2/14/2026,4,Vault,9.125,3,,2,Optional note',
  'Example Invitational,2/14/2026,4,Bars,8.950,5,,,',
  'Example Invitational,2/14/2026,4,Beam,9.200,2,,,',
  'Example Invitational,2/14/2026,4,Floor,9.300,1,,,',
].join('\n');

export function ImportView({
  gymnastName,
  initialMsoId,
}: {
  gymnastName: string;
  initialMsoId?: string | null;
}) {
  const [msoId, setMsoId] = useState(initialMsoId || '');
  const [isLinked, setIsLinked] = useState(Boolean(initialMsoId));
  const [meets, setMeets] = useState<MsoMeetSummary[]>([]);
  const [csvMeets, setCsvMeets] = useState<ImportedMeet[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [importedCsvKeys, setImportedCsvKeys] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

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

  const previewCsv = async (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error('Choose a CSV smaller than 2 MB. That is already a heroic number of meets.');
      return;
    }

    try {
      const preview = parseCsvImports(await file.text());
      setCsvMeets(preview.meets);
      setCsvWarnings(preview.warnings);
      setImportedCsvKeys([]);
      toast.success(`Found ${preview.meets.length} meet${preview.meets.length === 1 ? '' : 's'} to review.`);
    } catch (error) {
      setCsvMeets([]);
      setCsvWarnings([]);
      toast.error(error instanceof Error ? error.message : 'Unable to read that CSV.');
    }
  };

  const importCsv = (meet: ImportedMeet) => {
    const key = `${meet.name}|${meet.startDate ?? ''}`;
    startTransition(async () => {
      const result = await importCsvMeet(meet);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setImportedCsvKeys((current) => [...current, key]);
      toast.success(`${meet.name} imported.`);
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
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
            Preview a spreadsheet export before adding it. The file is read in your browser and is not retained.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p className="text-sm font-medium">Review before importing</p>
              {csvMeets.map((meet) => {
                const key = `${meet.name}|${meet.startDate ?? ''}`;
                const imported = importedCsvKeys.includes(key);
                return (
                  <div key={key} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{meet.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatCalendarDate(meet.startDate)} · Level {meet.level || 'TBD'} · {meet.scores.length} events
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meet.scores.map((score) => `${displayApparatus(score.apparatus)} ${score.value.toFixed(3)}`).join(' · ')}
                      </p>
                    </div>
                    <Button onClick={() => importCsv(meet)} disabled={isPending || imported}>
                      {imported ? <Check className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
                      {imported ? 'Imported' : 'Import'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {meets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>MSO Meets</CardTitle>
            <CardDescription>
              Imported meets can be refreshed when MSO posts corrections.
            </CardDescription>
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
                  {meet.isImported ? (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  ) : (
                    <CloudDownload className="mr-2 h-4 w-4" />
                  )}
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
