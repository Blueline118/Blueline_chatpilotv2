-- 20251005_kb_search_function.sql
-- Doel: multi-stage KB-zoekfunctie met tags en recall-fallback

drop function if exists public.kb_search_chunks(uuid, text, integer);

create or replace function public.kb_search_chunks(p_org uuid, q text, k int default 5)
returns table (id uuid, title text, snippet text, rank real, tags text[])
language sql
security invoker
as $$
  with norm as (
    select
      trim(coalesce(q,'')) as q_raw,
      nullif(regexp_replace(lower(coalesce(q,'')),'\s+',' ','g'),'') as q_norm
  ),
  tsq1 as (
    select websearch_to_tsquery('dutch', (select q_raw from norm)) as q
  ),
  tsq2 as (
    select plainto_tsquery('dutch', (select q_raw from norm)) as q
  ),
  s1 as (
    select v.id, v.title, left(v.body,220) as snippet,
           ts_rank(v.ts, tsq1.q) as rank, v.tags
    from public.kb_chunks_search_view v, tsq1
    where v.org_id = p_org
      and tsq1.q <> ''::tsquery
      and v.ts @@ tsq1.q
    order by rank desc, v.created_at desc
    limit k
  ),
  s2 as (
    select v.id, v.title, left(v.body,220) as snippet,
           ts_rank(v.ts, tsq2.q) as rank, v.tags
    from public.kb_chunks_search_view v, tsq2
    where v.org_id = p_org
      and tsq2.q <> ''::tsquery
      and v.ts @@ tsq2.q
    order by rank desc, v.created_at desc
    limit k
  ),
  tokens as (
    select regexp_split_to_table((select q_norm from norm), ' ') as tok
  ),
  tok_long as (
    select tok from tokens where length(tok) >= 4
  ),
  s3 as ( -- recall fallback op title/body/tags::text
    select v.id, v.title, left(v.body,220) as snippet,
           0.0001::real as rank, v.tags
    from public.kb_chunks_search_view v
    where v.org_id = p_org
      and exists (
        select 1 from tok_long t
        where v.title ilike '%'||t.tok||'%'
           or v.body  ilike '%'||t.tok||'%'
           or v.tags::text ilike '%'||t.tok||'%'
      )
    order by v.created_at desc
    limit k
  ),
  base as (
    select * from s1
    union all
    select * from s2 where not exists (select 1 from s1)
    union all
    select * from s3 where not exists (select 1 from s1) and not exists (select 1 from s2)
  ),
  dedup as (
    select distinct on (id) id, title, snippet, rank, tags
    from base
    order by id, rank desc
  )
  select id, title, snippet, rank, tags
  from dedup
  order by rank desc
  limit k;
$$;
