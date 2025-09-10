import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,        // sessie blijft bewaard (localStorage)
      autoRefreshToken: true,      // tokens worden automatisch vernieuwd
      detectSessionInUrl: true     // leest de access_token uit de magic link URL
    }
  }
);
