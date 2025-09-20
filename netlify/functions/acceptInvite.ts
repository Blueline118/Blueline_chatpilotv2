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
  [key: string]: unknown;
};

type SupabaseAdminClient = ReturnType<typeof supabaseAdmin>;
type MinimalUser = { id: string; email?: string | null };

async function getAuthUserByEmail(admin: SupabaseAdminClient, email: string): Promise<MinimalUser | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin
    .schema('auth')
    .from('users')
    .select('id,email')
    .eq('email', normalized)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  if (!data) return null;

  return { id: data.id, email: data.email } as MinimalUser;
}

async function ensureAuthUser(admin: SupabaseAdminClient, email: string): Promise<MinimalUser> {
  const normalized = email.trim().toLowerCase();
  const existing = await getAuthUserByEmail(admin, normalized);
  if (existing) {
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    email_confirm: false,
  });

  if (error) {
    if (error.message?.toLowerCase().includes('already registered')) {
      const retry = await getAuthUserByEmail(admin, normalized);
      if (retry) return retry;
    }
    throw new Error(error.message || 'Kon gebruiker niet aanmaken');
  }

  if (!data?.user) {
    throw new Error('Gebruiker niet aangemaakt');
  }

  return { id: data.user.id, email: data.user.email };
}

function buildRedirectLocation(event: Parameters<Handler>[0]) {
  const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
  const hostHeader = (event.headers['x-forwarded-host'] || event.headers.host) as
    | string
    | undefined;
  const base =
    process.env.APP_ORIGIN || (hostHeader ? `${scheme}://${hostHeader}` : `${scheme}://localhost`);
  return `${base}/app?invite=accepted`;
}

export const handler: Handler = async (event) => {
  const headers = buildCorsHeaders(event.headers.origin);
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers };
    }

    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Use GET' }),
      };
    }

    const token = event.queryStringParameters?.token;
    const noRedirect = event.queryStringParameters?.noRedirect === '1';

    if (!token) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Ontbrekende token parameter' }),
      };
    }

    const admin = supabaseAdmin();

    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (inviteErr) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: inviteErr.message }),
      };
    }

    if (!invite) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Uitnodiging niet gevonden of ongeldig' }),
      };
    }

    const inviteRow = invite as InviteRow;
    const hasAcceptedAt = Object.prototype.hasOwnProperty.call(inviteRow, 'accepted_at');
    const hasUsedAt = Object.prototype.hasOwnProperty.call(inviteRow, 'used_at');
    const usageField: 'accepted_at' | 'used_at' | null = hasAcceptedAt
      ? 'accepted_at'
      : hasUsedAt
        ? 'used_at'
        : null;
    const alreadyUsedValue = usageField ? (inviteRow as any)[usageField] : null;

    if (alreadyUsedValue) {
      return {
        statusCode: 409,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Uitnodiging is al gebruikt' }),
      };
    }

    const expiresAtValue = Object.prototype.hasOwnProperty.call(inviteRow, 'expires_at')
      ? inviteRow.expires_at
      : null;
    const expiresAt = expiresAtValue ? new Date(expiresAtValue as string) : null;
    if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return {
        statusCode: 410,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Uitnodiging is verlopen' }),
      };
    }

    const user = await ensureAuthUser(admin, inviteRow.email);

    const { error: membershipErr } = await admin
      .from('memberships')
      .upsert(
        { org_id: inviteRow.org_id, user_id: user.id, role: inviteRow.role },
        { onConflict: 'org_id,user_id' }
      );

    if (membershipErr) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: membershipErr.message }),
      };
    }

    const timestamp = new Date().toISOString();
    let markedUsed = false;

    if (usageField) {
      let updateQuery = admin
        .from('invites')
        .update({ [usageField]: timestamp })
        .eq('id', inviteRow.id)
        .is(usageField, null);

      const { data: updateRows, error: updateErr } = await updateQuery.select('id');

      if (updateErr) {
        return {
          statusCode: 500,
          headers: jsonHeaders,
          body: JSON.stringify({ error: updateErr.message }),
        };
      }

      if (!updateRows || updateRows.length === 0) {
        return {
          statusCode: 409,
          headers: jsonHeaders,
          body: JSON.stringify({ error: 'Uitnodiging is al gebruikt' }),
        };
      }

      markedUsed = true;
    } else {
      const { data: deletedRows, error: deleteErr } = await admin
        .from('invites')
        .delete()
        .eq('id', inviteRow.id)
        .select('id');

      if (deleteErr) {
        return {
          statusCode: 500,
          headers: jsonHeaders,
          body: JSON.stringify({ error: deleteErr.message }),
        };
      }

      if (!deletedRows || deletedRows.length === 0) {
        return {
          statusCode: 409,
          headers: jsonHeaders,
          body: JSON.stringify({ error: 'Uitnodiging is al gebruikt' }),
        };
      }

      markedUsed = true;
    }

    if (!markedUsed) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Kon uitnodiging niet afronden' }),
      };
    }

    const redirectTo = buildRedirectLocation(event);

    if (noRedirect) {
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ success: true, redirectTo }),
      };
    }

    return {
      statusCode: 302,
      headers: { ...headers, Location: redirectTo },
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error?.message || 'acceptInvite failure' }),
    };
  }
};
