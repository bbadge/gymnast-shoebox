'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ensureActiveGymnast } from '@/app/actions/gymnast';
import { APPARATUSES } from '@/lib/gymnastics';
import type { ImportedMeet } from '@/lib/imports/types';
import { createClient } from '@/lib/supabase/server';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const importedMeetSchema = z.object({
  provider: z.literal('csv'),
  sourceId: z.null(),
  name: z.string().trim().min(1).max(160),
  level: z.string().trim().max(80).nullable(),
  startDate: dateSchema,
  endDate: dateSchema,
  allAroundPlace: z.number().int().positive().nullable(),
  notes: z.string().trim().max(2000).nullable(),
  scores: z.array(z.object({
    apparatus: z.enum(APPARATUSES),
    value: z.number().min(0).max(100),
    place: z.number().int().positive().nullable(),
    startValue: z.number().min(0).max(100).nullable(),
  })).min(1).max(APPARATUSES.length),
});
const importedBatchSchema = z.array(importedMeetSchema).min(1).max(100);

function meetKey(meet: Pick<ImportedMeet, 'name' | 'startDate'>) {
  return `${meet.name.trim().toLowerCase()}|${meet.startDate ?? ''}`;
}

function validateMeets(input: ImportedMeet[]) {
  const parsed = importedBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The imported meets are invalid.' } as const;
  }
  const invalidRange = parsed.data.find(
    (meet) => meet.startDate && meet.endDate && meet.endDate < meet.startDate
  );
  if (invalidRange) return { error: `${invalidRange.name} ends before it starts.` } as const;
  return { data: parsed.data };
}

async function importContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Authentication required.' as const };

  const gymnastId = await ensureActiveGymnast();
  if (!gymnastId) return { error: 'Create a gymnast profile first.' as const };
  return { supabase, gymnastId };
}

async function duplicateKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gymnastId: string,
  meets: ImportedMeet[]
) {
  const { data, error } = await supabase
    .from('competitions')
    .select('name, start_date')
    .eq('gymnast_id', gymnastId);
  if (error) throw new Error(error.message);
  const existing = new Set(
    data?.map((meet) => meetKey({ name: meet.name, startDate: meet.start_date }))
  );
  return meets.map(meetKey).filter((key) => existing.has(key));
}

export async function checkCsvImport(input: ImportedMeet[]) {
  const validated = validateMeets(input);
  if ('error' in validated) return { error: validated.error };
  const context = await importContext();
  if ('error' in context) return { error: context.error };

  try {
    return {
      success: true,
      duplicateKeys: await duplicateKeys(context.supabase, context.gymnastId, validated.data),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to check existing meets.' };
  }
}

export async function importCsvBatch(sourceName: string, input: ImportedMeet[]) {
  const validated = validateMeets(input);
  if ('error' in validated) return { error: validated.error };
  const normalizedSource = sourceName.trim().slice(0, 255) || 'CSV import';
  const context = await importContext();
  if ('error' in context) return { error: context.error };

  try {
    const duplicates = await duplicateKeys(context.supabase, context.gymnastId, validated.data);
    if (duplicates.length > 0) {
      return {
        error: 'Remove or skip the duplicate meets before importing.',
        duplicateKeys: duplicates,
      };
    }

    const { data: batchId, error } = await context.supabase.rpc('import_competition_batch', {
      p_gymnast_id: context.gymnastId,
      p_provider: 'csv',
      p_source_name: normalizedSource,
      p_meets: validated.data,
    });
    if (error?.code === '23505') {
      return { error: 'One or more meets already exist. Refresh the preview and try again.' };
    }
    if (error) return { error: error.message };

    revalidatePath('/dashboard');
    revalidatePath('/import');
    return {
      success: true,
      batch: {
        id: batchId as string,
        sourceName: normalizedSource,
        meetCount: validated.data.length,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to import the CSV batch.' };
  }
}

export async function undoCsvImport(batchId: string) {
  const parsedId = z.string().uuid().safeParse(batchId);
  if (!parsedId.success) return { error: 'Invalid import batch.' };
  const context = await importContext();
  if ('error' in context) return { error: context.error };

  const { data: deletedCount, error } = await context.supabase.rpc('undo_import_batch', {
    p_batch_id: parsedId.data,
  });
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/import');
  return { success: true, deletedCount: Number(deletedCount ?? 0) };
}
