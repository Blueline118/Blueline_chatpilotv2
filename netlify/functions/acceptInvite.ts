// netlify/functions/acceptInvite.ts
import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseAdmin } from './_shared/supabaseServer';

type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  accepted_at?: string | null;
  used_at?: string | null;
  expires_at?: string | null;
};

function json(status: number, headers: Record<string,string>, body: unknown) {
  return { statusCode: status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function redirect(headers: Record<string,string>, to: string) {
  return { statusCode: 302, headers: { ...headers, Location: to } };
}
function buildRedirectLocation(event: Parameters<Handler>[0]) {
  const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
  const host = (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined;
  const base = process.env.APP_ORIGIN || (host ? `${scheme}://${host}` : `${scheme}://localhost`);
  return `${base}/app?invite=accepted`;
}

// --- helpers: user lookup/creation via auth.users (service-role)
async function getAuthUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin
    .schema('auth')
    .from('users')
    .select('id,email')
    .eq('email', normalized)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? { id: data.id as string, email: data.email as string | null } : null;
}

async function ensureAuthUser(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await getAuthUserByEmail(admin, normalized);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: false,
  });
  if (error || !data?.user) throw new Error(error?.message || 'Kon gebruiker niet aanmaken');
  return { id: data.user.id, email: data.user.email };
}

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors };
    if (event.httpMethod !== 'GET')   return json(405, cors, { error: 'Use GET' });

    const token = event.queryStringParameters?.token;
    const noRedirect = event.queryStringParameters?.noRedirect === '1';
    if (!token) return json(400, cors, { error: 'Ontbrekende token parameter' });

    const admin = supabaseAdmin();

    // 1) Invite ophalen
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (inviteErr)           return json(400, cors, { error: inviteErr.message });
    if (!invite)             return json(400, cors, { error: 'Uitnodiging niet gevonden of ongeldig' });

    const inv = invite as InviteRow;

    // Al gebruikt?
    const usageField = ('accepted_at' in inv) ? 'accepted_at' : (('used_at' in inv) ? 'used_at' : null);
    if (usageField && (inv as any)[usageField]) return json(409, cors, { error: 'Uitnodiging is al gebruikt' });

    // Verlopen?
    if (inv.expires_at) {
      const exp = new Date(inv.expires_at);
      if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
        return json(410, cors, { error: 'Uitnodiging is verlopen' });
      }
    }

    // 2) auth user zekerstellen
    const user = await ensureAuthUser(admin, inv.email);

    // 3) Membership upsert
    const { error: upsertErr } = await admin
      .from('memberships')
      .upsert({ org_id: inv.org_id, user_id: user.id, role: inv.role }, { onConflict: 'org_id,user_id' });

    if (upsertErr) return json(500, cors, { error: upsertErr.message });

    // 4) Invite markeren als gebruikt (of weggooien als die kolommen er niet zijn)
    const nowIso = new Date().toISOString();
    if (usageField) {
      const { data: updated, error: updErr } = await admin
        .from('invites')
        .update({ [usageField]: nowIso })
        .eq('id', inv.id)
        .is(usageField, null)
        .select('id');

      if (updErr)            return json(500, cors, { error: updErr.message });
      if (!updated?.length)  return json(409, cors, { error: 'Uitnodiging is al gebruikt' });
    } else {
      const { data: deld, error: delErr } = await admin
        .from('invites')
        .delete()
        .eq('id', inv.id)
        .select('id');

      if (delErr)            return json(500, cors, { error: delErr.message });
      if (!deld?.length)     return json(409, cors, { error: 'Uitnodiging is al gebruikt' });
    }

    const to = buildRedirectLocation(event);
    return noRedirect ? json(200, cors, { success: true, redirectTo: to }) : redirect(cors, to);
  } catch (e: any) {
    return json(500, cors, { error: e?.message || 'acceptInvite failure' });
  }
};
