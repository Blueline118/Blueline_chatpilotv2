// src/hooks/useMembership.js
import useSWR from 'swr';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

/**
 * Haalt de rol van de ingelogde user op voor de actieve org.
 * Werkt onder RLS (memberships SELECT-policy uit stap 3).
 */
export function useMembership() {
  const { user, activeOrgId } = useAuth();
  const key = user?.id && activeOrgId ? ['membership', user.id, activeOrgId] : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', activeOrgId)
        .maybeSingle(); // retourneert 1 rij of null, geen throw op 0 rijen
      if (error) throw error;
      return data; // { role: 'ADMIN' } | null
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const normalizedRole = data?.role ? String(data.role).toUpperCase() : null;

  return {
    role: normalizedRole,
    loading: !!key && isLoading,
    error,
  };
}

export default useMembership;
