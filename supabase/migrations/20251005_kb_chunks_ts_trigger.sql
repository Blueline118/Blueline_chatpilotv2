-- 20251005_kb_chunks_ts_trigger.sql
-- Doel: onderhoud ts-vector via trigger + indexen (dutch)

-- Kolom ts toevoegen indien nodig
alter table public.kb_chunks
  add column if not exists ts tsvector;

-- Functie om ts te updaten met A/B/C weging
create or replace function public.kb_chunks_tsv_update()
returns trigger
language plpgsql
security definer
as $$
begin
  new.ts :=
      setweight(to_tsvector('dutch', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('dutch', array_to_string(coalesce(new.tags, '{}'), ' ')), 'B')
   || setweight(to_tsvector('dutch', coalesce(new.body, '')), 'C');
  return new;
end;
$$;

-- Trigger aanmaken/overschrijven
drop trigger if exists kb_chunks_tsv_trg on public.kb_chunks;
create trigger kb_chunks_tsv_trg
before insert or update of title, body, tags
on public.kb_chunks
for each row
execute function public.kb_chunks_tsv_update();

-- Backfill ts voor bestaande rijen
update public.kb_chunks
set title = title;

-- Indexen
create index if not exists kb_chunks_ts_gin on public.kb_chunks using gin (ts);
create index if not exists kb_chunks_tags_gin on public.kb_chunks using gin (tags);
