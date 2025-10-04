-- kb_search_chunks: voeg tags toe aan de return set
-- Policies/RLS ongewijzigd. Functie blijft SECURITY INVOKER.

-- Opmerking: we wijzigen alleen de RETURN TABLE signatuur en SELECT-lijst.
-- Bestaande callers die alleen id/title/snippet/rank lezen blijven werken.

create or replace function public.kb_search_chunks(
  p_org uuid,
  q     text,
  k     int default 5
)
returns table (
  id      uuid,
  title   text,
  snippet text,
  rank    real,
  tags    text[]
)
language sql
security invoker
as $$
  with tsq as (
    select case
      when coalesce(nullif(trim(q), ''), '') = '' then plainto_tsquery('dutch','')
      else websearch_to_tsquery('dutch', q)
    end as q
  )
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    ts_rank(v.ts, tsq.q) as rank,
    v.tags
  from public.kb_chunks_search_view v
  cross join tsq
  where v.org_id = p_org
    and (tsq.q = ''::tsquery or v.ts @@ tsq.q)
  order by rank desc, v.created_at desc
  limit k;
$$;

-- Rooktest (optioneel):
-- select * from public.kb_search_chunks('54ec8e89-d265-474d-98fc-d2ba579ac83f'::uuid, 'retour', 5);
