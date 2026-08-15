begin;

revoke all on public.import_batches from anon;

drop index if exists public.competitions_import_batch_id_idx;
create index if not exists competitions_import_batch_owner_idx
  on public.competitions (import_batch_id, user_id, gymnast_id)
  where import_batch_id is not null;

commit;
