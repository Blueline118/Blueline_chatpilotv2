// netlify/functions/acceptInvite.ts
import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseAdmin } from './_shared/supabaseServer';

type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  role: string; // enum role_type in DB
  token: string; // uuid string
  used_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
};

type JsonBody = { token?: string | null; noRedirect?: boolean | number | string | null };

/* ---------- kleine helpers ---------- */
function json(status: number, headers: Record<string, string>, body: unknown) {
  return { statusCode: status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function redirect(headers: Record<string, string>, to: string) {
  return { statusCode: 302, headers: { ...headers, Location: to } };
}
function getAppOrigin(event: Parameters<Handler>[0]) {
  const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
  const host = (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined;
  return process.env.APP_ORIGIN || (host ? `${scheme}://${host}` : `${scheme}://localhost`);
}
function buildRedirectLocation(event: Parameters<Handler>[0]) {
  // stuur ledenomgeving in: /app/members
  return `${getAppOrigin(event)}/app/members`;
}
async function readJson(event: Parameters<Handler>[0]): Promise<JsonBody> {
  try {
    return event.body ? (JSON.parse(event.body) as JsonBody) : {};
  } catch {
    return {};
  }
}

/**
 * Zoek een auth-user via de GoTrue Admin API.
 * Sommige versies hebben geen direct email-filter; we pagineren en matchen client-side.
 */
async function findUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    if (!data?.users?.length) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? null };
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null; // safety stop
  }
}

async function ensureAuthUser(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await findUserByEmail(admin, normalized);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: false,
  });

  if (error) {
    // race: bestond net al
    const again = await findUserByEmail(admin, normalized);
    if (again) return again;
    throw new Error(error.message || 'Kon gebruiker niet aanmaken');
  }
  if (!data?.user) throw new Error('Gebruiker niet aangemaakt');
  return { id: data.user.id, email: data.user.email ?? null };
}

/* ---------- main handler ---------- */
export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);

  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors };
    }

    // Ondersteun GET ?token= en POST { token }
    let token: string | null;
    let noRedirectFlag = false;

    if (event.httpMethod === 'GET') {
      token = event.queryStringParameters?.token ?? null;
      const nr = event.queryStringParameters?.noRedirect;
      noRedirectFlag = nr === '1' || nr === 'true' || nr === 'yes';
    } else if (event.httpMethod === 'POST') {
      const body = await readJson(event);
      token = body.token ?? null;
      const nr = body.noRedirect;
      noRedirectFlag = nr === true || nr === 1 || nr === '1' || nr === 'true' || nr === 'yes';
    } else {
      return json(405, cors, { error: 'Use GET or POST' });
    }

    if (!token) return json(400, cors, { error: 'Ontbrekende token parameter' });

    // Pak invite uit public schema
    const admin = supabaseAdmin();
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .select('id, org_id, email, role, token, used_at, revoked_at, expires_at')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (inviteErr) return json(400, cors, { error: inviteErr.message });
    if (!invite) return json(400, cors, { error: 'Uitnodiging niet gevonden of ongeldig' });

    const row = invite as InviteRow;

    // statuschecks
    const alreadyUsed = row.used_at ?? null;
    if (alreadyUsed) return json(409, cors, { error: 'Uitnodiging is al gebruikt' });

    if (row.revoked_at) return json(410, cors, { error: 'Uitnodiging is ongeldig gemaakt' });

    if (row.expires_at) {
      const exp = new Date(row.expires_at);
      if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
        return json(410, cors, { error: 'Uitnodiging is verlopen' });
      }
    }

    // ensure auth user exists
    const user = await ensureAuthUser(admin, row.email);

    // membership upsert (org_id + user_id uniek)
    const { error: upsertErr } = await admin
      .from('memberships')
      .upsert(
        { org_id: row.org_id, user_id: user.id, role: row.role },
        { onConflict: 'org_id,user_id' },
      );

    if (upsertErr) {
      console.error(
        JSON.stringify({ fn: 'acceptInvite', stage: 'upsert-membership', err: upsertErr.message, org: row.org_id, email: row.email })
      );
      return json(500, cors, { error: upsertErr.message });
    }

    // mark invite used (idempotent guard: only when used_at is null)
    const stamp = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from('invites')
      .update({ used_at: stamp })
      .eq('id', row.id)
      .is('used_at', null)
      .select('id');

    if (updErr) {
      console.error(
        JSON.stringify({ fn: 'acceptInvite', stage: 'after-upsert', err: updErr.message, org: row.org_id, email: row.email })
      );
      return json(500, cors, { error: updErr.message });
    }
    if (!updated || updated.length === 0) return json(409, cors, { error: 'Uitnodiging is al gebruikt' });

    const tokenSuffix = typeof row.token === 'string' ? row.token.slice(-6) : null;
    try {
      await admin.rpc('audit_log_event', {
        p_org: row.org_id,
        p_actor: user.id,
        p_action: 'invite_accepted',
        p_target: { email: row.email, token_suffix: tokenSuffix },
        p_meta: { source: 'function', fn: 'acceptInvite' },
      });
    } catch (error: any) {
      console.warn(
        JSON.stringify({ fn: 'acceptInvite', stage: 'audit-log', err: error?.message ?? 'rpc-failed', org: row.org_id, email: row.email })
      );
    }

    const to = buildRedirectLocation(event);
    return noRedirectFlag ? json(200, cors, { success: true, redirectTo: to }) : redirect(cors, to);
  } catch (e: any) {
    console.error(JSON.stringify({ fn: 'acceptInvite', stage: 'handler', err: e?.message ?? 'acceptInvite failure' }));
    return json(500, cors, { error: e?.message ?? 'acceptInvite failure' });
  }
};
