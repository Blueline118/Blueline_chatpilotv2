import { useEffect } from 'react';
import { supabase } from './lib/supabaseClient';

export default function TestSupabase() {
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      console.log('[Supabase check] session:', data, 'error:', error);
    })();
  }, []);
  return <div style={{padding: 12}}>Supabase client check: open je console (F12)</div>;
}
