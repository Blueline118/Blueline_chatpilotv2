#!/usr/bin/env node
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

// ---- ENV KEYS ----
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLIC_ANON_KEY

if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1) }
if (!SERVICE_KEY)   { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!ANON_KEY)      { console.error('Missing SUPABASE_ANON_KEY'); process.exit(1) }

// ---- ORG & USERS ----
const ORG_ID = '54ec8e89-d265-474d-98fc-d2ba579ac83f'

const USERS = {
  ADMIN:    { email: 'samir@bluelineccs.nl',       id: null },
  TEAM:     { email: 'info@bluelineccs.nl',        id: null },
  CUSTOMER: { email: 's.bouchdak@outlook.com',  id: null },
}

// ---- BASE DATA ----
const BASE_ORG = { id: ORG_ID, name: 'Acme' }
const BASE_MEMBERSHIPS = [
  { org_id: ORG_ID, user_id: USERS.ADMIN.id,    role: 'ADMIN' },
  { org_id: ORG_ID, user_id: USERS.TEAM.id,     role: 'TEAM' },
  { org_id: ORG_ID, user_id: USERS.CUSTOMER.id, role: 'CUSTOMER' },
]

// ---- CLIENTS ----
const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const anonAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const tokenCache = new Map()
const clientCache = new Map()

// ---- HELPERS ----
async function ensureBaselineData() {
  const { error: orgError } = await serviceClient
    .from('organizations')
    .upsert(BASE_ORG, { onConflict: 'id' })
  if (orgError) throw new Error(`Failed to seed organization: ${orgError.message}`)

  const { error: membershipsError } = await serviceClient
    .from('memberships')
    .upsert(BASE_MEMBERSHIPS, { onConflict: 'org_id,user_id' })
  if (membershipsError) throw new Error(`Failed to seed memberships: ${membershipsError.message}`)
}

async function fetchAccessToken(role) {
  if (tokenCache.has(role)) return tokenCache.get(role)

  const user = USERS[role]
  if (!user) throw new Error(`Unknown role: ${role}`)

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })
  if (error) throw new Error(`Failed to generate OTP for ${role}: ${error.message}`)

  const props = data?.properties
  if (!props?.email_otp || !props?.verification_type) {
    throw new Error(`OTP details missing for ${role}`)
  }

  const verifyResponse = await anonAuthClient.auth.verifyOtp({
    email: user.email,
    token: props.email_otp,
    type: props.verification_type,
  })
  if (verifyResponse.error) {
    throw new Error(`Failed to verify OTP for ${role}: ${verifyResponse.error.message}`)
  }

  const accessToken = verifyResponse.data.session?.access_token
  if (!accessToken) throw new Error(`No access token returned for ${role}`)

  tokenCache.set(role, accessToken)
  return accessToken
}

function createUserClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

async function getUserClient(role) {
  if (clientCache.has(role)) return clientCache.get(role)

  const token = await fetchAccessToken(role)
  const client = createUserClient(token)
  clientCache.set(role, client)
  return client
}

async function findMembership(userId) {
  const { data, error } = await serviceClient
    .from('memberships')
    .select('org_id,user_id,role')
    .eq('org_id', ORG_ID)
    .eq('user_id', userId)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') throw new Error(`Membership lookup failed: ${error.message}`)
  return data ?? null
}

async function runTest(name, fn) {
  try {
    const msg = await fn()
    console.log(`PASS ${name}${msg ? ` - ${msg}` : ''}`)
    return true
  } catch (err) {
    console.error(`FAIL ${name} - ${err.message ?? err}`)
    return false
  }
}

// ---- RUN ----
await ensureBaselineData()
const results = []

// CUSTOMER read test
results.push(await runTest('customer can read org members', async () => {
  const client = await getUserClient('CUSTOMER')
  const { data, error } = await client.rpc('get_org_members', { p_org: ORG_ID })
  if (error) throw new Error(`get_org_members failed: ${error.message}`)
  if (!Array.isArray(data) || data.length === 0) throw new Error('No memberships returned')
  return `${data.length} memberships visible`
}))

// TEAM read test
results.push(await runTest('team can read org members', async () => {
  const client = await getUserClient('TEAM')
  const { data, error } = await client.rpc('get_org_members', { p_org: ORG_ID })
  if (error) throw new Error(`get_org_members failed: ${error.message}`)
  if (!Array.isArray(data) || data.length === 0) throw new Error('No memberships returned')
  return `${data.length} memberships visible`
}))

// ADMIN update test
results.push(await runTest('admin can update team role', async () => {
  const client = await getUserClient('ADMIN')
  const { error } = await client.rpc('admin_update_member_role', {
    p_org_id: ORG_ID,
    p_member_id: USERS.TEAM.id,
    p_role: 'TEAM',
  })
  if (error) throw new Error(`admin_update_member_role failed: ${error.message}`)

  const membership = await findMembership(USERS.TEAM.id)
  if (!membership) throw new Error('TEAM membership missing after update')
  if (membership.role !== 'TEAM') throw new Error(`TEAM role is ${membership.role}`)
  return 'TEAM role unchanged as expected'
}))

// CUSTOMER delete test
results.push(await runTest('customer cannot delete members', async () => {
  const client = await getUserClient('CUSTOMER')
  const resp = await client.rpc('admin_delete_member', {
    p_org_id: ORG_ID,
    p_member_id: USERS.TEAM.id,
  })
  if (!resp.error) {
    await ensureBaselineData()
    throw new Error('admin_delete_member succeeded for customer')
  }
  return `Denied with: ${resp.error.message}`
}))

// ADMIN delete test
results.push(await runTest('admin can delete members', async () => {
  const client = await getUserClient('ADMIN')
  const { error } = await client.rpc('admin_delete_member', {
    p_org_id: ORG_ID,
    p_member_id: USERS.TEAM.id,
  })
  if (error) throw new Error(`admin_delete_member failed: ${error.message}`)

  const membership = await findMembership(USERS.TEAM.id)
  if (membership) throw new Error('TEAM membership still exists after delete')

  await ensureBaselineData()
  return 'TEAM membership removed and restored'
}))

const hasFailure = results.some(r => !r)
if (hasFailure) process.exitCode = 1
else console.log('All permission tests passed')
