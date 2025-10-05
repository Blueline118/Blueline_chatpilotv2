import { supabase } from '../lib/supabaseClient';

// Kleine normalizer: haalt slimme quotes en rare whitespace weg
function normalizeQuery(q) {
  if (!q || typeof q !== 'string') return '';
  return q
    .replace(/[“”„‟«»"']/g, '')   // slimme quotes en quotes weg
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();
}

/**
 * Zoek relevante KB-chunks voor een org + query.
 * - Échte FTS-hits doorlaten (filter rank≈0.0001 fallback).
 * - Drempel 0.05 (voor NL-stemming/varianten zoals ‘retourneren’ vs ‘retour’).
 * - Verrijkt met tags[] (non-breaking).
 */
export async function searchKb(orgId, query, limit) {
  const k = typeof limit === 'number' && limit > 0 ? limit : 3;
  if (!orgId || !query) return [];

  const qNorm = normalizeQuery(query);

  if (process.env.NODE_ENV !== 'production') {
    console.log('=== KB SEARCH CALLED ===', { orgId, q: query, qNorm, k });
  }

  try {
    const { data: rows } = await supabase
      .rpc('kb_search_chunks', {
        p_org: orgId,
        q: qNorm, // <-- genormaliseerde query naar RPC
        k,
      })
      .throwOnError();

    if (process.env.NODE_ENV !== 'production') {
      const count = Array.isArray(rows) ? rows.length : 0;
      console.log('KB search result', { orgId, q: query, qNorm, k, count, rows });
    }

    const items = Array.isArray(rows)
      ? rows.map((row, index) => {
          const rawTags =
            row?.tags ??
            row?.chunk_tags ??
            row?.document_tags ??
            row?.chunkTags ??
            row?.documentTags ??
            row?.preview_tags ??
            row?.previewTags ??
            null;

          return {
            id: row?.id ?? row?.chunk_id ?? row?.document_id ?? null,
            title: row?.title ?? row?.chunk_title ?? row?.document_title ?? '',
            snippet: row?.snippet ?? row?.chunk_snippet ?? row?.content ?? '',
            rank: typeof row?.rank === 'number' ? row.rank : (index + 1) * 0.05,
            tags: Array.isArray(rawTags) ? rawTags : [],
          };
        })
      : [];

    // Precisie-filters
    const EPS = 1e-9;
    const THRESHOLD = 0.05;   // was 0.15 → NL-stemming is soms lager, daarom ruimer
    const filtered = items
      .filter((i) => typeof i.rank === 'number' && i.rank > 0.0001 + EPS) // geen fallback-hits
      .filter((i) => (i.rank ?? 0) >= THRESHOLD)
      .slice(0, k);

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        'KB filtered',
        filtered.map((x) => ({ title: x.title, rank: x.rank, tags: (x.tags || []).slice(0, 3) }))
      );
    }

    return filtered;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const wrapped = new Error(`KB_SEARCH_ERROR: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      console.error(wrapped);
    }
    throw wrapped;
  }
}
