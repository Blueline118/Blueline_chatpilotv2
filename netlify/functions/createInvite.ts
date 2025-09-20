import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';
import { sendInviteEmail } from './_shared/email';

type BodyIn =
  | { p_org?: string; p_email?: string; p_role?: 'ADMIN' | 'TEAM' | 'CUSTOMER' }
  | { org_id?: string; email?: string; role?: 'ADMIN' | 'TEAM' | 'CUSTOMER' };

export const handler: Handler = async (event) => {
  const headers = buildCorsHeaders(event.headers.origin);
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Use POST' }),
      };
    }

    const auth = event.headers.authorization;
    if (!auth) {
      return {
        statusCode: 401,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Missing Authorization header' }),
      };
    }

    const raw =
      event.isBase64Encoded && event.body
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body || '{}';

    let json: BodyIn;
    try {
      json = JSON.parse(raw) as BodyIn;
    } catch (error: any) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    const p_org_raw = (json as any).p_org ?? (json as any).org_id;
    const p_email_raw = (json as any).p_email ?? (json as any).email;
    const p_role_raw = (json as any).p_role ?? (json as any).role;

    const p_org = typeof p_org_raw === 'string' ? p_org_raw : undefined;
    const p_email = typeof p_email_raw === 'string' ? p_email_raw.trim() : undefined;
    const p_role =
      typeof p_role_raw === 'string' ? p_role_raw.trim().toUpperCase() : undefined;

    if (!p_org || !p_email || !p_role) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: 'Body must include p_org/org_id, p_email/email, p_role/role',
        }),
      };
    }

    const validRoles = new Set(['ADMIN', 'TEAM', 'CUSTOMER']);
    if (!validRoles.has(p_role)) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Invalid role' }),
      };
    }

    const supabase = supabaseForRequest(auth);

    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user) {
      return {
        statusCode: 401,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const { data: adminRows, error: adminErr } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', p_org)
      .eq('user_id', me.user.id)
      .eq('role', 'ADMIN')
      .limit(1);

    if (adminErr) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: adminErr.message }),
      };
    }

    if (!adminRows?.length) {
      return {
        statusCode: 403,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Only ADMIN can create invites' }),
      };
    }

    const { data: invData, error: invErr } = await supabase.rpc('create_invite', {
      p_org,
      p_email,
      p_role,
    } as any);

    if (invErr) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: invErr.message }),
      };
    }

    const inv: any = Array.isArray(invData) ? invData[0] : invData;
    if (!inv?.token) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Invite resultaat ongeldig' }),
      };
    }

    const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
    const hostHeader =
      (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined;
    const base = process.env.APP_ORIGIN || (hostHeader ? `${scheme}://${hostHeader}` : `${scheme}://localhost`);
    const acceptUrl = `${base}/accept-invite?token=${encodeURIComponent(inv.token)}`;

    const sendEmail = (json as any).sendEmail !== false;

    const mail: { attempted: boolean; sent: boolean; reason: string | null } = {
      attempted: false,
      sent: false,
      reason: null,
    };

    if (sendEmail) {
      mail.attempted = true;
      const r = await sendInviteEmail({
        to: inv.email,
        acceptUrl,
        brand: 'Blueline Chatpilot',
      });
      mail.sent = r.sent;
      if (!r.sent) {
        mail.reason = r.reason ?? 'unknown';
      }
    } else {
      mail.reason = 'disabled';
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        acceptUrl,
        invite: { id: inv.id, email: inv.email, role: inv.role },
        email: mail,
      }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: e?.message || 'createInvite failure' }),
    };
  }
};
