-- 20251005_kb_chunks_search_view.sql
-- Doel: simpele view met ts beschikbaar

drop view if exists public.kb_chunks_search_view;

create view public.kb_chunks_search_view as
select
  id,
  org_id,
  source_id,
  title,
  body,
  tags,
  created_at,
  ts
from public.kb_chunks;
