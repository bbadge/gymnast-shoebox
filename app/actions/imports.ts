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

export async function importCsvMeet(input: ImportedMeet) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Authentication required.' };

  const gymnastId = await ensureActiveGymnast();
  if (!gymnastId) return { error: 'Create a gymnast profile first.' };

  const parsed = importedMeetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The imported meet is invalid.' };
  }
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
    return { error: 'End date cannot be before the start date.' };
  }

  const meet = parsed.data;
  const { error } = await supabase.rpc('save_competition', {
    p_competition_id: null,
    p_gymnast_id: gymnastId,
    p_name: meet.name,
    p_level: meet.level,
    p_start_date: meet.startDate,
    p_end_date: meet.endDate,
    p_all_around_place: meet.allAroundPlace,
    p_notes: meet.notes,
    p_mso_meet_id: null,
    p_scores: meet.scores.map((score) => ({
      apparatus: score.apparatus,
      value: score.value,
      place: score.place,
      start_value: score.startValue,
    })),
  });

  if (error?.code === '23505') return { error: 'A meet with this name and start date already exists.' };
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/import');
  return { success: true };
}
