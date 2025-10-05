-- Migration: kb_search_chunks returns tags
-- File: supabase/migrations/20251005_kb_search_chunks_add_tags.sql
-- Purpose: breid de zoekfunctie uit zodat naast id/title/snippet/rank ook tags[] wordt geretourneerd.
-- Notes:
-- - Bestaande callers die alleen de eerste 4 kolommen gebruiken blijven werken.
-- - SECURITY INVOKER i.v.m. RLS.
-- - Vereist dat public.kb_chunks_search_view de kolommen (id, org_id, title, body, tags, created_at, ts) bevat.

-- 1) Drop exact signature (anders krijg je: cannot change return type...)
drop function if exists public.kb_search_chunks(uuid, text, integer);

-- 2) Recreate met tags in RETURNS TABLE en SELECT-lijsten
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
as $function$
with norm as (
  select trim(coalesce(q, ''))                                        as q_raw,
         nullif(regexp_replace(lower(coalesce(q,'')),'\s+',' ','g'),'') as q_norm
),
tsq1 as (  -- websearch: goed voor “garantie voorwaarden”
  select websearch_to_tsquery('dutch', (select q_raw from norm)) as q
),
tsq2 as (  -- plainto: toleranter
  select plainto_tsquery('dutch', (select q_raw from norm)) as q
),
s1 as (
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    ts_rank(v.ts, tsq1.q) as rank,
    v.tags,
    1 as tier
  from public.kb_chunks_search_view v, tsq1
  where v.org_id = p_org
    and (tsq1.q <> ''::tsquery and v.ts @@ tsq1.q)
  order by rank desc, v.created_at desc
  limit k
),
s2 as (
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    ts_rank(v.ts, tsq2.q) as rank,
    v.tags,
    2 as tier
  from public.kb_chunks_search_view v, tsq2
  where v.org_id = p_org
    and (tsq2.q <> ''::tsquery and v.ts @@ tsq2.q)
  order by rank desc, v.created_at desc
  limit k
),
tokens as (
  -- splits de vraag in woorden; filter op lengte ≥ 4 voor signal/noise
  select regexp_split_to_table((select q_norm from norm), ' ') as tok
),
tok_long as (
  select tok from tokens where length(tok) >= 4
),
s3 as (  -- recall-fallback: simpele ILIKE op titel/body met langere tokens
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    0.0001::real as rank,
    v.tags,
    3 as tier
  from public.kb_chunks_search_view v
  where v.org_id = p_org
    and exists (
      select 1
      from tok_long t
      where v.title ilike '%' || t.tok || '%'
         or v.body  ilike '%' || t.tok || '%'
    )
  order by v.created_at desc
  limit k
),
results as (
  -- kies s1 (beste), anders s2, anders s3
  select id, title, snippet, rank, tags from s1
  union all
  select id, title, snippet, rank, tags from s2
  where not exists (select 1 from s1)
  union all
  select id, title, snippet, rank, tags from s3
  where not exists (select 1 from s1) and not exists (select 1 from s2)
)
select * from results
limit k;
$function$;

-- 3) Smoketests (handmatig draaien)
-- (A) Basischeck met 'retour'
-- select * from public.kb_search_chunks('54ec8e89-d265-474d-98fc-d2ba579ac83f'::uuid, 'retour', 5);

-- (B) Check dat tags terugkomen
-- select id, title, tags from public.kb_search_chunks('54ec8e89-d265-474d-98fc-d2ba579ac83f'::uuid, 'kortingscode', 5);

-- (C) Controleer fallback (ILIKE) door een term te gebruiken die wél als tag bestaat maar niet in body/title
-- select * from public.kb_search_chunks('54ec8e89-d265-474d-98fc-d2ba579ac83f'::uuid, 'actiecode', 5);
