// src/hooks/usePermission.js
import useSWR from 'swr';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export function usePermission(permKey) {
  const { activeOrgId } = useAuth();
  const key = activeOrgId && permKey ? ['perm', permKey, activeOrgId] : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      // ⬅ let op: arg-namen MOETEN p_org / p_perm heten (zoals in je SQL-functie)
      const { data, error } = await supabase.rpc('has_permission', {
        p_org: activeOrgId,
        p_perm: permKey,
      });
      if (error) throw error;
      return !!data; // boolean
    },
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  return { allowed: data === true, loading: !!key && isLoading, error };
}
