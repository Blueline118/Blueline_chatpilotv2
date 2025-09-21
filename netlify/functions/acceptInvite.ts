import type { Handler } from '@netlify/functions'
import { buildCorsHeaders, supabaseAdmin } from './_shared/supabaseServer'

type InviteRow = {
  id: string
  org_id: string
  email: string
  role: string
  token: string
  accepted_at?: string | null
  used_at?: string | null
  expires_at?: string | null
}

type SupabaseAdminClient = ReturnType<typeof supabaseAdmin>
type MinimalUser = { id: string; email?: string | null }

function json(status: number, headers: Record<string, string>, body: unknown) {
  return { statusCode: status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function redirect(headers: Record<string, string>, to: string) {
  return { statusCode: 302, headers: { ...headers, Location: to } }
}

function buildRedirectLocation(event: Parameters<Handler>[0]) {
  const scheme = (event.headers['x-forwarded-proto'] || 'https') as string
  const host = (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined
  const base = process.env.APP_ORIGIN || (host ? `${scheme}://${host}` : `${scheme}://localhost`)
  return `${base}/app?invite=accepted`
}

/** Vind user via auth schema (er is geen SDK getUserByEmail) */
async function findAuthUserByEmail(admin: SupabaseAdminClient, email: string): Promise<MinimalUser | null> {
  const normalized = email.trim().toLowerCase()
  const { data, error } = await admin
    .schema('auth')
    .from('users')
    .select('id,email')
    .eq('email', normalized)
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  if (!data) return null
  return { id: (data as any).id, email: (data as any).email ?? normalized }
}

/** Bestaat user? -> return; anders aanmaken via service-role */
async function ensureAuthUser(admin: SupabaseAdminClient, email: string): Promise<MinimalUser> {
  const existing = await findAuthUserByEmail(admin, email)
  if (existing) return existing

  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: false
  })
  if (error) {
    // second try: race-condition?
    const retry = await findAuthUserByEmail(admin, email)
    if (retry) return retry
    throw new Error(error.message || 'Kon gebruiker niet aanmaken')
  }
  if (!data?.user) throw new Error('Gebruiker niet aangemaakt')
  return { id: data.user.id, email: data.user.email }
}

export const handler: Handler = async (event) => {
  const headers = buildCorsHeaders(event.headers?.origin)
  const j = (s: number, b: unknown) => json(s, headers, b)

  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers }
    if (event.httpMethod !== 'GET') return j(405, { error: 'Use GET' })

    const token = event.queryStringParameters?.token
    const noRedirect = event.queryStringParameters?.noRedirect === '1'
    if (!token) return j(400, { error: 'Ontbrekende token parameter' })

    const admin = supabaseAdmin()

    // 1) Vind invite
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .select('*')
      .eq('token', token)
      .limit(1)
      .maybeSingle()

    if (inviteErr) return j(400, { error: inviteErr.message })
    if (!invite) return j(400, { error: 'Uitnodiging niet gevonden of ongeldig' })

    const inv = invite as InviteRow

    // 2) Al gebruikt/verlopen?
    const usageField = (Object.prototype.hasOwnProperty.call(inv, 'accepted_at') ? 'accepted_at'
                      : Object.prototype.hasOwnProperty.call(inv, 'used_at') ? 'used_at'
                      : null) as 'accepted_at' | 'used_at' | null

    if (usageField && (inv as any)[usageField]) {
      return j(409, { error: 'Uitnodiging is al gebruikt' })
    }
    if (inv.expires_at) {
      const exp = new Date(inv.expires_at)
      if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
        return j(410, { error: 'Uitnodiging is verlopen' })
      }
    }

    // 3) User garanderen
    const user = await ensureAuthUser(admin, inv.email)

    // 4) Membership upsert
    const { error: memErr } = await admin
      .from('memberships')
      .upsert(
        { org_id: inv.org_id, user_id: user.id, role: inv.role },
        { onConflict: 'org_id,user_id' }
      )
    if (memErr) return j(500, { error: memErr.message })

    // 5) Token markeren (of verwijderen)
    let ok = false
    if (usageField) {
      const { data: upd, error: updErr } = await admin
        .from('invites')
        .update({ [usageField]: new Date().toISOString() })
        .eq('id', inv.id)
        .is(usageField, null)
        .select('id')
      if (updErr) return j(500, { error: updErr.message })
      ok = !!upd && upd.length > 0
    } else {
      const { data: deld, error: delErr } = await admin
        .from('invites')
        .delete()
        .eq('id', inv.id)
        .select('id')
      if (delErr) return j(500, { error: delErr.message })
      ok = !!deld && deld.length > 0
    }
    if (!ok) return j(409, { error: 'Uitnodiging is al gebruikt' })

    const to = buildRedirectLocation(event)
    return noRedirect ? j(200, { success: true, redirectTo: to }) : redirect(headers, to)
  } catch (e: any) {
    return j(500, { error: e?.message || 'acceptInvite failure' })
  }
}
