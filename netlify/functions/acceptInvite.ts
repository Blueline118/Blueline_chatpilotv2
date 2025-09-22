// netlify/functions/acceptInvite.ts
import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseAdmin } from './_shared/supabaseServer';

// ----- Types -----
type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  role: string;           // enum in DB
  token: string;
  accepted_at?: string | null;
  used_at?: string | null;
  expires_at?: string | null;
};

type MinimalUser = { id: string; email: string | null };

// ----- Helpers -----
function json(statusCode: number, headers: Record<string, string>, body: unknown) {
  return {
    statusCode,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function redirect(headers: Record<string, string>, to: string) {
  return {
    statusCode: 302,
    headers: { ...headers, Location: to },
    body: '',
  };
}

function buildRedirectLocation(event: Parameters<Handler>[0]) {
  const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
  const host = (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined;
  const base =
    process.env.APP_ORIGIN ||
    (host ? `${scheme}://${host}` : `${scheme}://localhost`);
  return `${base}/app?invite=accepted`;
}

/**
 * Zoek een auth user (service role) via directe query op auth.users
 * (dit ontwijkt verschillen tussen GoTrue admin SDK versies).
 */
async function getAuthUserByEmail(email: string): Promise<MinimalUser | null> {
  const admin = supabaseAdmin();
  const normalized = email.trim().toLowerCase();

  const { data, error } = await admin
    .schema('auth')               // 🔒 forceer schema zodat “public/graphql_public” fout verdwijnt
    .from('users')
    .select('id,email')
    .eq('email', normalized)
    .limit(1)
    .maybeSingle();

  if (error && (error as any).code !== 'PGRST116') {
    throw new Error(error.message);
  }
  if (!data) return null;

  return { id: (data as any).id, email: (data as any).email ?? null };
}

/** Zorg dat er een auth user bestaat, anders maak aan (email niet bevestigd) */
async function ensureAuthUser(email: string): Promise<MinimalUser> {
  const admin = supabaseAdmin();
  const normalized = email.trim().toLowerCase();

  const existing = await getAuthUserByEmail(normalized);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: false,
  });
  if (error) {
    // concurrentie of “already registered” -> nog 1x lookup
    const again = await getAuthUserByEmail(normalized);
    if (again) return again;
    throw new Error(error.message || 'Kan gebruiker niet aanmaken');
  }
  if (!data?.user) throw new Error('Gebruiker niet aangemaakt');

  return { id: data.user.id, email: data.user.email ?? null };
}

// ----- Netlify Function -----
export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: '' };
    }
    if (event.httpMethod !== 'GET') {
      return json(405, jsonHeaders, { error: 'Use GET' });
    }

    const token = event.queryStringParameters?.token;
    const noRedirect = event.queryStringParameters?.noRedirect === '1';
    if (!token) {
      return json(400, jsonHeaders, { error: 'Ontbrekende token parameter' });
    }

    const admin = supabaseAdmin();

    // 1) Invite ophalen
    const { data: invite, error: invErr } = await admin
      .from('invites')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle<InviteRow>();

    if (invErr) return json(400, jsonHeaders, { error: invErr.message });
    if (!invite) return json(400, jsonHeaders, { error: 'Uitnodiging niet gevonden of ongeldig' });

    // 2) Al gebruikt / verlopen?
    const usedField =
      Object.prototype.hasOwnProperty.call(invite, 'accepted_at') ? 'accepted_at'
      : Object.prototype.hasOwnProperty.call(invite, 'used_at')     ? 'used_at'
      : null;

    const alreadyUsed = usedField ? (invite as any)[usedField] : null;
    if (alreadyUsed) return json(409, jsonHeaders, { error: 'Uitnodiging is al gebruikt' });

    const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
    if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return json(410, jsonHeaders, { error: 'Uitnodiging is verlopen' });
    }

    // 3) Zorg dat user bestaat
    const user = await ensureAuthUser(invite.email);

    // 4) Membership upsert
    const { error: memErr } = await admin
      .from('memberships')
      .upsert(
        { org_id: invite.org_id, user_id: user.id, role: invite.role },
        { onConflict: 'org_id,user_id' }
      );

    if (memErr) return json(500, jsonHeaders, { error: memErr.message });

    // 5) Invite markeren als gebruikt (veld verschilt per migratie)
    const stampField = usedField ?? 'accepted_at';
    const { data: updated, error: updErr } = await admin
      .from('invites')
      .update({ [stampField]: new Date().toISOString() })
      .eq('id', invite.id)
      .is(stampField, null)
      .select('id');

    if (updErr) return json(500, jsonHeaders, { error: updErr.message });
    if (!updated || updated.length === 0) {
      return json(409, jsonHeaders, { error: 'Uitnodiging is al gebruikt' });
    }

    const redirectTo = buildRedirectLocation(event);
    if (noRedirect) return json(200, jsonHeaders, { success: true, redirectTo });

    return redirect(cors, redirectTo);
  } catch (e: any) {
    return json(500, jsonHeaders, { error: e?.message || 'acceptInvite failure' });
  }
};
