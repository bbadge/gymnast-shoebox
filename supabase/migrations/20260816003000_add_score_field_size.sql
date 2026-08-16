begin;

alter table public.scores
  add column field_size integer,
  add constraint scores_field_size_positive
    check (field_size is null or field_size > 0),
  add constraint scores_place_within_field
    check (place is null or field_size is null or place <= field_size);

create or replace view public.competitions_with_scores
with (security_invoker = true)
as
select
  c.id,
  c.user_id,
  c.gymnast_id,
  c.name,
  c.start_date,
  c.end_date,
  c.level,
  c.all_around_place,
  c.created_at,
  coalesce(
    (
      select json_agg(
        json_build_object(
          'apparatus', s.apparatus,
          'value', s.value,
          'start_value', s.start_value,
          'place', s.place,
          'field_size', s.field_size
        ) order by s.apparatus
      )
      from public.scores s
      where s.competition_id = c.id
    ),
    '[]'::json
  ) as scores,
  (
    select sum(s.value)
    from public.scores s
    where s.competition_id = c.id
  ) as all_around_score,
  c.mso_meet_id,
  c.notes
from public.competitions c;

create or replace function public.save_competition(
  p_competition_id uuid,
  p_gymnast_id uuid,
  p_name text,
  p_level text,
  p_start_date date,
  p_end_date date,
  p_all_around_place integer,
  p_notes text,
  p_mso_meet_id text,
  p_scores jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_competition_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.gymnasts
    where id = p_gymnast_id and user_id = v_user_id
  ) then
    raise exception 'Gymnast profile not found';
  end if;

  if p_competition_id is null then
    insert into public.competitions (
      user_id, gymnast_id, name, level, start_date, end_date,
      all_around_place, notes, mso_meet_id
    ) values (
      v_user_id, p_gymnast_id, p_name, p_level, p_start_date, p_end_date,
      p_all_around_place, p_notes, p_mso_meet_id
    )
    returning id into v_competition_id;
  else
    update public.competitions
    set name = p_name,
        level = p_level,
        start_date = p_start_date,
        end_date = p_end_date,
        all_around_place = p_all_around_place,
        notes = p_notes,
        mso_meet_id = coalesce(p_mso_meet_id, mso_meet_id),
        updated_at = now()
    where id = p_competition_id and user_id = v_user_id
    returning id into v_competition_id;

    if v_competition_id is null then
      raise exception 'Competition not found';
    end if;
  end if;

  delete from public.scores where competition_id = v_competition_id;

  insert into public.scores (
    competition_id, apparatus, value, place, field_size, start_value
  )
  select
    v_competition_id,
    item->>'apparatus',
    nullif(item->>'value', '')::numeric,
    nullif(item->>'place', '')::integer,
    nullif(item->>'field_size', '')::integer,
    nullif(item->>'start_value', '')::numeric
  from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) item
  where item->>'apparatus' in (
    'vault', 'uneven_bars', 'balance_beam', 'floor_exercise',
    'pommel_horse', 'still_rings', 'parallel_bars', 'high_bar'
  )
  and (
    item->>'value' is not null
    or item->>'place' is not null
    or item->>'field_size' is not null
    or item->>'start_value' is not null
  );

  return v_competition_id;
end;
$$;

create or replace function public.import_competition_batch(
  p_gymnast_id uuid,
  p_provider text,
  p_source_name text,
  p_meets jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_competition_id uuid;
  v_meet jsonb;
  v_meet_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.gymnasts
    where id = p_gymnast_id and user_id = v_user_id
  ) then
    raise exception 'Gymnast profile not found';
  end if;

  if p_provider <> 'csv' then
    raise exception 'Unsupported import provider';
  end if;

  if jsonb_typeof(p_meets) <> 'array' then
    raise exception 'Meets must be a JSON array';
  end if;

  v_meet_count := jsonb_array_length(p_meets);
  if v_meet_count < 1 or v_meet_count > 100 then
    raise exception 'Import between 1 and 100 meets at a time';
  end if;

  insert into public.import_batches (
    user_id, gymnast_id, provider, source_name, meet_count
  ) values (
    v_user_id, p_gymnast_id, p_provider, nullif(btrim(p_source_name), ''), v_meet_count
  )
  returning id into v_batch_id;

  for v_meet in select value from jsonb_array_elements(p_meets)
  loop
    if nullif(btrim(v_meet->>'name'), '') is null
      or char_length(btrim(v_meet->>'name')) > 160 then
      raise exception 'Every imported meet needs a name';
    end if;

    if char_length(coalesce(v_meet->>'level', '')) > 80
      or char_length(coalesce(v_meet->>'notes', '')) > 2000
      or (
        nullif(v_meet->>'allAroundPlace', '') is not null
        and (v_meet->>'allAroundPlace')::integer <= 0
      ) then
      raise exception 'Imported meet details are invalid';
    end if;

    if jsonb_typeof(v_meet->'scores') <> 'array'
      or jsonb_array_length(v_meet->'scores') < 1
      or jsonb_array_length(v_meet->'scores') > 8 then
      raise exception 'Every imported meet needs between 1 and 8 event scores';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_meet->'scores') score
      where score->>'apparatus' not in (
        'vault', 'uneven_bars', 'balance_beam', 'floor_exercise',
        'pommel_horse', 'still_rings', 'parallel_bars', 'high_bar'
      )
      or nullif(score->>'value', '') is null
      or (score->>'value')::numeric not between 0 and 100
      or (
        nullif(score->>'place', '') is not null
        and (score->>'place')::integer <= 0
      )
      or (
        nullif(score->>'fieldSize', '') is not null
        and (score->>'fieldSize')::integer <= 0
      )
      or (
        nullif(score->>'place', '') is not null
        and nullif(score->>'fieldSize', '') is not null
        and (score->>'place')::integer > (score->>'fieldSize')::integer
      )
      or (
        nullif(score->>'startValue', '') is not null
        and (score->>'startValue')::numeric not between 0 and 100
      )
    ) then
      raise exception 'Imported score values are invalid';
    end if;

    if nullif(v_meet->>'startDate', '') is not null
      and nullif(v_meet->>'endDate', '') is not null
      and (v_meet->>'endDate')::date < (v_meet->>'startDate')::date then
      raise exception 'A meet end date cannot be before its start date';
    end if;

    insert into public.competitions (
      user_id, gymnast_id, name, level, start_date, end_date,
      all_around_place, notes, mso_meet_id, import_batch_id
    ) values (
      v_user_id, p_gymnast_id, btrim(v_meet->>'name'),
      nullif(btrim(v_meet->>'level'), ''),
      nullif(v_meet->>'startDate', '')::date,
      nullif(v_meet->>'endDate', '')::date,
      nullif(v_meet->>'allAroundPlace', '')::integer,
      nullif(btrim(v_meet->>'notes'), ''), null, v_batch_id
    )
    returning id into v_competition_id;

    insert into public.scores (
      competition_id, apparatus, value, place, field_size, start_value
    )
    select
      v_competition_id,
      score->>'apparatus',
      nullif(score->>'value', '')::numeric,
      nullif(score->>'place', '')::integer,
      nullif(score->>'fieldSize', '')::integer,
      nullif(score->>'startValue', '')::numeric
    from jsonb_array_elements(coalesce(v_meet->'scores', '[]'::jsonb)) score
    where score->>'apparatus' in (
      'vault', 'uneven_bars', 'balance_beam', 'floor_exercise',
      'pommel_horse', 'still_rings', 'parallel_bars', 'high_bar'
    )
    and nullif(score->>'value', '') is not null;
  end loop;

  return v_batch_id;
end;
$$;

revoke all on function public.save_competition(
  uuid, uuid, text, text, date, date, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_competition(
  uuid, uuid, text, text, date, date, integer, text, text, jsonb
) to authenticated;
revoke all on function public.import_competition_batch(uuid, text, text, jsonb) from public;
grant execute on function public.import_competition_batch(uuid, text, text, jsonb) to authenticated;

commit;
