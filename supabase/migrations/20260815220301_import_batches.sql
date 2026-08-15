begin;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  provider text not null check (provider in ('csv')),
  source_name text check (source_name is null or char_length(source_name) <= 255),
  meet_count integer not null check (meet_count > 0 and meet_count <= 100),
  created_at timestamptz not null default now(),
  unique (id, user_id, gymnast_id)
);

alter table public.import_batches enable row level security;

create policy "Users can view own import batches"
  on public.import_batches for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create own import batches"
  on public.import_batches for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.gymnasts g
      where g.id = gymnast_id and g.user_id = (select auth.uid())
    )
  );
create policy "Users can delete own import batches"
  on public.import_batches for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.import_batches to authenticated;
revoke all on public.import_batches from anon;

create index import_batches_user_id_idx on public.import_batches (user_id);
create index import_batches_gymnast_created_idx
  on public.import_batches (gymnast_id, created_at desc);

alter table public.competitions
  add column import_batch_id uuid,
  add constraint competitions_import_batch_fkey
    foreign key (import_batch_id, user_id, gymnast_id)
    references public.import_batches (id, user_id, gymnast_id)
    on delete cascade;

create index competitions_import_batch_owner_idx
  on public.competitions (import_batch_id, user_id, gymnast_id)
  where import_batch_id is not null;

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
      user_id,
      gymnast_id,
      name,
      level,
      start_date,
      end_date,
      all_around_place,
      notes,
      mso_meet_id,
      import_batch_id
    ) values (
      v_user_id,
      p_gymnast_id,
      btrim(v_meet->>'name'),
      nullif(btrim(v_meet->>'level'), ''),
      nullif(v_meet->>'startDate', '')::date,
      nullif(v_meet->>'endDate', '')::date,
      nullif(v_meet->>'allAroundPlace', '')::integer,
      nullif(btrim(v_meet->>'notes'), ''),
      null,
      v_batch_id
    )
    returning id into v_competition_id;

    insert into public.scores (
      competition_id, apparatus, value, place, start_value
    )
    select
      v_competition_id,
      score->>'apparatus',
      nullif(score->>'value', '')::numeric,
      nullif(score->>'place', '')::integer,
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

create or replace function public.undo_import_batch(p_batch_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.import_batches
    where id = p_batch_id and user_id = v_user_id
  ) then
    raise exception 'Import batch not found';
  end if;

  delete from public.competitions
  where import_batch_id = p_batch_id and user_id = v_user_id;
  get diagnostics v_deleted_count = row_count;

  delete from public.import_batches
  where id = p_batch_id and user_id = v_user_id;

  return v_deleted_count;
end;
$$;

revoke all on function public.import_competition_batch(uuid, text, text, jsonb) from public;
grant execute on function public.import_competition_batch(uuid, text, text, jsonb) to authenticated;
revoke all on function public.undo_import_batch(uuid) from public;
grant execute on function public.undo_import_batch(uuid) to authenticated;

commit;
