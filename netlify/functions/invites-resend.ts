import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseForRequest } from './_shared/supabaseServer';

interface BodyIn {
  org_id?: string;
  p_org_id?: string;
  email?: string;
  p_email?: string;
  send_email?: boolean;
  sendEmail?: boolean;
}

const FN = 'invites-resend';

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders('*');
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: 'Use POST' }) };
    }

    const auth = event.headers.authorization;
    if (!auth) {
      return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: 'Missing Authorization header' }) };
    }

    const rawBody = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body ?? '{}';

    let body: BodyIn;
    try {
      body = JSON.parse(rawBody) as BodyIn;
    } catch (error: any) {
      console.error(
        JSON.stringify({ fn: FN, stage: 'parse', err: error?.message ?? 'parse-failed' })
      );
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const orgId = body.p_org_id ?? body.org_id;
    const emailRaw = body.p_email ?? body.email;
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : undefined;
    const sendEmailFlag =
      typeof body.send_email === 'boolean'
        ? body.send_email
        : typeof body.sendEmail === 'boolean'
          ? body.sendEmail
          : false;

    if (!orgId || !email) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Missing org_id and/or email' }),
      };
    }

    let supabase;
    try {
      supabase = supabaseForRequest(auth);
    } catch (error: any) {
      console.error(
        JSON.stringify({ fn: FN, stage: 'supabase_init', err: error?.message ?? 'init-failed' })
      );
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Supabase init failed' }) };
    }

    const { data, error } = await supabase.rpc('resend_invite', {
      p_org_id: orgId,
      p_email: email,
    });

    if (error) {
      console.error(
        JSON.stringify({ fn: FN, stage: 'rpc', err: error.message, org_id: orgId, email })
      );
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: error.message }) };
    }

    const token = typeof data === 'string' ? data : (data as any)?.token ?? data;
    if (!token || typeof token !== 'string') {
      console.error(JSON.stringify({ fn: FN, stage: 'rpc', err: 'invalid-return', data }));
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid RPC response' }) };
    }

    if (sendEmailFlag) {
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.FROM_EMAIL;

      if (!apiKey || !fromEmail) {
        console.warn(
          JSON.stringify({
            fn: FN,
            stage: 'resend_email',
            err: 'missing_resend_config',
            org_id: orgId,
            email,
          })
        );
        return {
          statusCode: 207,
          headers: jsonHeaders,
          body: JSON.stringify({ token, emailed: false, error: 'resend_failed' }),
        };
      }

      const headerOrigin =
        event.headers.origin ??
        event.headers.Origin ??
        event.headers.ORIGIN ??
        event.headers['x-forwarded-origin'] ??
        event.headers['X-Forwarded-Origin'];
      const acceptOrigin =
        process.env.APP_ORIGIN ?? headerOrigin ?? new URL(event.rawUrl).origin;
      const acceptUrl = `${acceptOrigin.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;
      const text = `Hallo,\n\nJe bent opnieuw uitgenodigd voor Chatpilot. Gebruik de volgende link binnen 7 dagen: ${acceptUrl}\n\nGroeten,\nChatpilot`;

      const html = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>Uitnodiging voor Chatpilot</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
    <span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0;">Link 7 dagen geldig</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;padding:32px;text-align:left;color:#1c2b49;">
            <tr>
              <td style="font-size:20px;font-weight:600;padding-bottom:16px;">Je uitnodiging voor Chatpilot</td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;padding-bottom:24px;">
                Hallo,<br />Er staat een uitnodiging klaar om lid te worden van de Chatpilot workspace. De link hieronder is 7 dagen geldig.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <a href="${acceptUrl}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;background:#2563eb;background-color:#2563eb;border:1px solid #0b83cd;border-radius:8px;text-decoration:none;">Accepteer uitnodiging</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#4b5563;">
                Werkt de knop niet? Plak deze link in je browser:<br /><a href="${acceptUrl}" style="color:#0b83cd;word-break:break-all;">${acceptUrl}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject: 'Je uitnodiging voor Chatpilot',
          html,
          text,
        }),
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err ?? 'unknown');
        console.warn(JSON.stringify({ fn: FN, stage: 'resend_email', err: message, org_id: orgId, email }));
        return null;
      });

      if (!emailResponse || !emailResponse.ok) {
        const status = emailResponse?.status ?? 'fetch_failed';
        const bodyText = emailResponse ? await emailResponse.text().catch(() => null) : null;
        console.warn(
          JSON.stringify({ fn: FN, stage: 'resend_email', err: 'resend_failed', status, body: bodyText, org_id: orgId, email })
        );
        return {
          statusCode: 207,
          headers: jsonHeaders,
          body: JSON.stringify({ token, emailed: false, error: 'resend_failed' }),
        };
      }

      console.info(
        JSON.stringify({ fn: FN, stage: 'success', org_id: orgId, email, emailed: true, token })
      );
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ token, emailed: true }) };
    }

    console.info(JSON.stringify({ fn: FN, stage: 'success', org_id: orgId, email, emailed: false, token }));
    return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ token, emailed: false }) };
  } catch (error: any) {
    console.error(JSON.stringify({ fn: FN, stage: 'unexpected', err: error?.message ?? 'unknown' }));
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Unexpected error' }) };
  }
};
