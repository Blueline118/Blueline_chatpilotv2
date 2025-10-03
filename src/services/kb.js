export async function searchKb({ supabase, orgId, query, limit }) {
  const { data, error } = await supabase.rpc('kb_search_chunks', {
    p_org: orgId,
    q: query,
    k: limit ?? 3,
  });

  const items = Array.isArray(data)
    ? data.map((row, index) => ({
        id: row?.id ?? row?.chunk_id ?? row?.document_id ?? null,
        title: row?.title ?? row?.chunk_title ?? row?.document_title ?? '',
        snippet: row?.snippet ?? row?.chunk_snippet ?? row?.content ?? '',
        rank: row?.rank ?? index + 1,
      }))
    : [];

  return { items, error };
}
