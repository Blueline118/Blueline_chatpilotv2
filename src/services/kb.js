import { supabase } from '../lib/supabaseClient';

export async function searchKb(orgId, query, limit) {
  const k = typeof limit === 'number' && limit > 0 ? limit : 3;
  if (!orgId || !query) return [];

  if (process.env.NODE_ENV !== 'production') {
    console.log("=== KB SEARCH CALLED ===", { orgId, q: query, k });
  }

  try {
    const { data: rows } = await supabase
      .rpc("kb_search_chunks", {
        p_org: orgId,
        q: query,
        k,
      })
      .throwOnError();

    if (process.env.NODE_ENV !== 'production') {
      const count = Array.isArray(rows) ? rows.length : 0;
      console.log("KB search result", { orgId, q: query, k, count });
    }

    const items = Array.isArray(rows)
  ? rows.map((row, index) => ({
      id: row?.id ?? row?.chunk_id ?? row?.document_id ?? null,
      title: row?.title ?? row?.chunk_title ?? row?.document_title ?? '',
      snippet: row?.snippet ?? row?.chunk_snippet ?? row?.content ?? '',
      rank: typeof row?.rank === 'number' ? row.rank : (index + 1) * 0.05, // fallback klein positief
      // ✅ nieuw: tags optioneel doorgeven (non-breaking)
      tags: Array.isArray(row?.tags) ? row.tags : [],
    }))
  : [];


    // Relevantie-drempel (pas later gerust aan, bv. 0.05–0.20)
    const THRESHOLD = 0.1;
    const filtered = items
      .filter((i) => (i.rank ?? 0) >= THRESHOLD)
      .slice(0, k);

    return Array.isArray(filtered) ? filtered : [];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const wrapped = new Error(`KB_SEARCH_ERROR: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      console.error(wrapped);
    }
    throw wrapped;
  }
}
