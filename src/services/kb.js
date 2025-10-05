import { supabase } from '../lib/supabaseClient';

/**
 * Zoek relevante KB-chunks voor een org + query.
 * - Geeft alleen échte FTS-hits terug (filtert fallback-hits met rank≈0.0001)
 * - Verhoogde drempel voor relevantie (0.15)
 * - Verrijkt met tags[] (non‑breaking)
 */
export async function searchKb(orgId, query, limit) {
  const k = typeof limit === 'number' && limit > 0 ? limit : 3;
  if (!orgId || !query) return [];

  if (process.env.NODE_ENV !== 'production') {
    console.log('=== KB SEARCH CALLED ===', { orgId, q: query, k });
  }

  try {
    const { data: rows } = await supabase
      .rpc('kb_search_chunks', {
        p_org: orgId,
        q: query,
        k,
      })
      .throwOnError();

    if (process.env.NODE_ENV !== 'production') {
      const count = Array.isArray(rows) ? rows.length : 0;
      console.log('KB search result', { orgId, q: query, k, count });
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
            // note: server stuurt rank (real); fallback alleen als die ontbreekt
            rank: typeof row?.rank === 'number' ? row.rank : (index + 1) * 0.05,
            tags: Array.isArray(rawTags) ? rawTags : [],
          };
        })
      : [];

    // Precisie‑filters: negeer recall‑fallback (rank ≈ 0.0001) + minimale drempel
    const EPS = 1e-9;
    const THRESHOLD = 0.15; // was 0.10

    const filtered = items
      .filter((i) => typeof i.rank === 'number' && i.rank > 0.0001 + EPS) // geen fallback‑hits
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
