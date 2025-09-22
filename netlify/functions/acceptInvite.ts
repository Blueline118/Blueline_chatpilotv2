// BOP: helpers
type SupabaseAdminClient = ReturnType<typeof supabaseAdmin>;
type MinimalUser = { id: string; email?: string | null };

async function getAuthUserByEmail(admin: SupabaseAdminClient, email: string): Promise<MinimalUser | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin
    .schema('auth')                      // <-- expliciet schema
    .from('users')
    .select('id,email')
    .eq('email', normalized)
    .limit(1)
    .maybeSingle();

  // PGRST116 = no rows
  if (error && (error as any).code !== 'PGRST116') {
    throw new Error(error.message);
  }
  return data ? { id: (data as any).id, email: (data as any).email } : null;
}

async function ensureAuthUser(admin: SupabaseAdminClient, email: string): Promise<MinimalUser> {
  const normalized = email.trim().toLowerCase();

  // 1) direct uit auth.users
  const existing = await getAuthUserByEmail(admin, normalized);
  if (existing) return existing;

  // 2) niet gevonden? maak aan via admin API
  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: false,
  });
  if (error) throw new Error(error.message || 'Kon gebruiker niet aanmaken');
  if (!data?.user) throw new Error('Gebruiker niet aangemaakt');

  return { id: data.user.id, email: data.user.email };
}
// EOP: helpers