create or replace function public.kb_search_chunks(p_org uuid, q text, k int default 5)
returns table (
  id uuid,
  title text,
  snippet text,
  rank real
)
language sql
security invoker
set search_path = public
as $$
with params as (
  select nullif(trim(q), '') as query
),
source_chunks as (
  select c.id, c.title, c.body, c.ts, c.created_at
  from public.kb_chunks c
  where c.org_id = p_org
),
s1 as (
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    ts_rank(v.ts, websearch_to_tsquery('dutch', p.query))::real as rank,
    v.created_at
  from params p
  join source_chunks v on true
  where p.query is not null
    and v.ts @@ websearch_to_tsquery('dutch', p.query)
),
s2 as (
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    ts_rank(v.ts, plainto_tsquery('dutch', p.query))::real as rank,
    v.created_at
  from params p
  join source_chunks v on true
  where p.query is not null
    and not exists (select 1 from s1)
    and v.ts @@ plainto_tsquery('dutch', p.query)
),
s3_tokens as (
  select distinct token
  from params p,
  lateral regexp_split_to_table(
    regexp_replace(coalesce(lower(p.query), ''), '[^a-z0-9\s]+', ' ', 'g'),
    '\s+'
  ) as token
  where length(token) >= 4
),
s3 as (
  select
    v.id,
    v.title,
    left(v.body, 400) as snippet,
    0.0001::real as rank,
    v.created_at
  from source_chunks v
  where not exists (select 1 from s1)
    and not exists (select 1 from s2)
    and exists (
      select 1
      from s3_tokens t
      where v.title ilike '%' || t.token || '%'
         or v.body ilike '%' || t.token || '%'
    )
),
results as (
  select id, title, snippet, rank, created_at from s1
  union all
  select id, title, snippet, rank, created_at from s2
  union all
  select id, title, snippet, rank, created_at from s3
)
select r.id, r.title, r.snippet, r.rank
from results r
order by r.rank desc, r.created_at desc
limit coalesce(k, 5);
$$;
