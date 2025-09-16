// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY, // ⬅️ zorg dat dit de ANON KEY is
  { auth: { persistSession: true, autoRefreshToken: true } }
);
