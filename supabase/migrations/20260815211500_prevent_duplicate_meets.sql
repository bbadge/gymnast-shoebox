begin;

create unique index if not exists competitions_gymnast_name_start_uidx
  on public.competitions (gymnast_id, lower(btrim(name)), start_date)
  where start_date is not null;

commit;
