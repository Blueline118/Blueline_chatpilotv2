// src/hooks/usePermission.js
import useSWR from 'swr';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export function usePermission(permKey) {
  const { activeOrgId } = useAuth();

  const { data, error, isLoading } = useSWR(
    activeOrgId ? ['perm', permKey, activeOrgId] : null,
    async () => {
      const { data, error } = await supabase.rpc('has_permission', {
        org: activeOrgId,
        perm: permKey,
      });
      if (error) throw error;
      return !!data; // boolean
    }
  );

  return {
    allowed: data === true,
    loading: isLoading,
    error
  };
}
