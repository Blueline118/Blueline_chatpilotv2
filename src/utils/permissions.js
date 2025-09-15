import { supabase } from '../supabaseClient';

export async function hasPermission(orgId, key) {
  const { data, error } = await supabase.rpc('has_permission', {
    p_org: orgId,
    p_perm: key
  });
  if (error) throw error;
  return !!data;
}
