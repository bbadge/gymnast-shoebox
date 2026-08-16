'use server';

import { revalidatePath } from 'next/cache';
import { ensureActiveGymnast } from '@/app/actions/gymnast';
import { createMsoProvider } from '@/lib/imports/mso-provider';
import type { ImportMeetSummary } from '@/lib/imports/types';
import { createClient } from '@/lib/supabase/server';

export type MsoMeetSummary = ImportMeetSummary;

async function getLinkedGymnast() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Authentication required' as const };

  const gymnastId = await ensureActiveGymnast();
  if (!gymnastId) return { error: 'No gymnast profile selected.' as const };

  const { data: gymnast } = await supabase
    .from('gymnasts')
    .select('id, name, mso_id')
    .eq('id', gymnastId)
    .eq('user_id', user.id)
    .single();

  if (!gymnast?.mso_id) {
    return { error: 'Link an MSO Athlete ID to this gymnast first.' as const };
  }

  return { supabase, gymnast };
}

export async function fetchMsoMeets() {
  const linked = await getLinkedGymnast();
  if ('error' in linked) return { error: linked.error };
  const { supabase, gymnast } = linked;

  try {
    const provider = createMsoProvider(gymnast.mso_id);
    const meets = await provider.listMeets();
    if (meets.length === 0) return { error: 'No meets were found for the linked MSO athlete.' };

    const { data: existing } = await supabase
      .from('competitions')
      .select('name, mso_meet_id')
      .eq('gymnast_id', gymnast.id);
    const ids = new Set(existing?.map((meet) => meet.mso_meet_id).filter(Boolean));
    const legacyNames = new Set(
      existing?.filter((meet) => !meet.mso_meet_id).map((meet) => meet.name)
    );

    return {
      success: true,
      meets: meets.map((meet) => ({
        ...meet,
        isImported: ids.has(meet.id) || legacyNames.has(meet.name),
      })),
    };
  } catch (error) {
    console.error('MSO meet list failed:', error);
    return { error: 'MSO could not be reached or its page format changed.' };
  }
}

export async function syncMsoMeet(meet: MsoMeetSummary) {
  const linked = await getLinkedGymnast();
  if ('error' in linked) return { error: linked.error };
  const { supabase, gymnast } = linked;

  try {
    const provider = createMsoProvider(gymnast.mso_id);
    const parsed = await provider.fetchMeet(meet);
    let { data: existing } = await supabase
      .from('competitions')
      .select('id, notes')
      .eq('gymnast_id', gymnast.id)
      .eq('mso_meet_id', meet.id)
      .maybeSingle();

    if (!existing) {
      const legacy = await supabase
        .from('competitions')
        .select('id, notes')
        .eq('gymnast_id', gymnast.id)
        .eq('name', parsed.name)
        .is('mso_meet_id', null)
        .maybeSingle();
      existing = legacy.data;
    }

    const existingFieldSizes = new Map<string, number>();
    if (existing?.id) {
      const { data: existingScores } = await supabase
        .from('scores')
        .select('apparatus, field_size')
        .eq('competition_id', existing.id);
      for (const score of existingScores ?? []) {
        if (score.field_size) existingFieldSizes.set(score.apparatus, score.field_size);
      }
    }

    const { error } = await supabase.rpc('save_competition', {
      p_competition_id: existing?.id ?? null,
      p_gymnast_id: gymnast.id,
      p_name: parsed.name,
      p_level: parsed.level,
      p_start_date: parsed.startDate,
      p_end_date: parsed.endDate,
      p_all_around_place: parsed.allAroundPlace,
      p_notes: existing?.notes ?? parsed.notes,
      p_mso_meet_id: parsed.sourceId,
      p_scores: parsed.scores.map((score) => ({
        apparatus: score.apparatus,
        value: score.value,
        place: score.place,
        field_size: score.fieldSize ?? existingFieldSizes.get(score.apparatus) ?? null,
        start_value: score.startValue,
      })),
    });
    if (error?.code === '23505') {
      return { error: 'This meet is already in the archive. Refresh the import list and try again.' };
    }
    if (error) return { error: error.message };

    revalidatePath('/dashboard');
    revalidatePath('/import');
    return { success: true, updated: Boolean(existing) };
  } catch (error) {
    console.error('MSO sync failed:', error);
    return { error: error instanceof Error ? error.message : 'MSO sync failed.' };
  }
}
