export type SendInviteParams = {
  to: string;
  acceptUrl: string;
  from?: string;
  brand?: string;
};

export type SendInviteResult =
  | { sent: true }
  | { sent: false; reason: 'missing_env' | 'api_error'; status?: number; body?: string };

export async function sendInviteEmail(p: SendInviteParams): Promise<SendInviteResult> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = p.from || process.env.FROM_EMAIL;
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    return { sent: false, reason: 'missing_env' };
  }

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial">
      <h2>${p.brand || 'Blueline Chatpilot'}</h2>
      <p>Je bent uitgenodigd om lid te worden. Klik op de knop hieronder om de uitnodiging te accepteren.</p>
      <p><a href="${p.acceptUrl}"
            style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
         Uitnodiging accepteren
      </a></p>
      <p>Werkt de knop niet? Kopieer dan deze link:<br>${p.acceptUrl}</p>
    </div>
  `.trim();

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [p.to],
        subject: `${p.brand || 'Blueline Chatpilot'} — Uitnodiging`,
        html,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { sent: false, reason: 'api_error', status: resp.status, body: text };
    }
    return { sent: true };
  } catch (error: any) {
    return {
      sent: false,
      reason: 'api_error',
      body: typeof error?.message === 'string' ? error.message : undefined,
    };
  }
}
