// netlify/functions/acceptInvite.ts
import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseAdmin } from './_shared/supabaseServer';

type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  used_at?: string | null;
  accepted_at?: string | null;    // back-compat veldnaam
  expires_at?: string | null;
};

// kleine helpers voor nette JSON / redirect responses
function json(status: number, headers: Record<string, string>, body: unknown) {
  return {
    statusCode: status,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
function redirect(headers: Record<string, string>, to: string) {
  return { statusCode: 302, headers: { ...headers, Location: to } };
}
function buildRedirectLocation(event: Parameters<Handler>[0]) {
  const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
  const host =
    (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined;
  const base = process.env.APP_ORIGIN || (host ? `${scheme}://${host}` : `${scheme}://localhost`);
  return `${base}/app?invite=accepted`;
}

/**
 * Zoek een auth-user via de GoTrue Admin API.
 * Sommige versies hebben geen direct email-filter; we pagineren en matchen client-side.
 */
async function findUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200; // redelijke batch
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    if (!data?.users?.length) return null;

    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? null };

    if (data.users.length < perPage) return null; // laatste pagina
    page += 1;
    if (page > 50) return null; // safety stop
  }
}

async function ensureAuthUser(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const normalized = email.trim().toLowerCase();

  // 1) bestaat al?
  const existing = await findUserByEmail(admin, normalized);
  if (existing) return existing;

  // 2) aanmaken
  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: false,
  });

  // sommige Supabase versies geven “already registered”
  if (error) {
    const again = await findUserByEmail(admin, normalized);
    if (again) return again;
    throw new Error(error.message || 'Kon gebruiker niet aanmaken');
  }

  if (!data?.user) throw new Error('Gebruiker niet aangemaakt');
  return { id: data.user.id, email: data.user.email ?? null };
}

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors };
    if (event.httpMethod !== 'GET') return json(405, cors, { error: 'Use GET' });

    const token = event.queryStringParameters?.token;
    const noRedirect = event.queryStringParameters?.noRedirect === '1';
    if (!token) return json(400, cors, { error: 'Ontbrekende token parameter' });

    const admin = supabaseAdmin();

    // ✅ Lees de invite uit *public* (géén auth schema meer!)
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (inviteErr) return json(400, cors, { error: inviteErr.message });
    if (!invite) return json(400, cors, { error: 'Uitnodiging niet gevonden of ongeldig' });

    const row = invite as InviteRow;

    // al gebruikt?
    const used = row.used_at ?? row.accepted_at ?? null;
    if (used) return json(409, cors, { error: 'Uitnodiging is al gebruikt' });

    // verlopen?
    if (row.expires_at) {
      const exp = new Date(row.expires_at);
      if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
        return json(410, cors, { error: 'Uitnodiging is verlopen' });
      }
    }

    // ✅ Zoek of maak auth-user via Admin API (geen PostgREST)
    const user = await ensureAuthUser(admin, row.email);

    // ✅ Upsert membership (public schema)
    const { error: upsertErr } = await admin
      .from('memberships')
      .upsert({ org_id: row.org_id, user_id: user.id, role: row.role }, { onConflict: 'org_id,user_id' });

    if (upsertErr) return json(500, cors, { error: upsertErr.message });

    // ✅ Markeer invite als gebruikt (public schema)
    const stamp = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from('invites')
      .update({ used_at: stamp })
      .eq('id', row.id)
      .is('used_at', null)
      .select('id');

    if (updErr) return json(500, cors, { error: updErr.message });
    if (!updated || updated.length === 0) return json(409, cors, { error: 'Uitnodiging is al gebruikt' });

    const to = buildRedirectLocation(event);
    return noRedirect ? json(200, cors, { success: true, redirectTo: to }) : redirect(cors, to);
  } catch (e: any) {
    return json(500, cors, { error: e?.message ?? 'acceptInvite failure' });
  }
};
