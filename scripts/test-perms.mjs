#!/usr/bin/env node
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLIC_ANON_KEY

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

if (!ANON_KEY) {
  console.error('Missing SUPABASE_ANON_KEY in environment')
  process.exit(1)
}

const ORG_ID = '10000000-0000-0000-0000-000000000000'
const USERS = {
  admin: {
    id: '00000000-0000-0000-0000-0000000000aa',
    email: 'admin@example.com',
  },
  agent: {
    id: '00000000-0000-0000-0000-0000000000bb',
    email: 'agent@example.com',
  },
  customer: {
    id: '00000000-0000-0000-0000-0000000000cc',
    email: 'customer@example.com',
  },
}

const BASE_ORG = { id: ORG_ID, name: 'Acme' }
const BASE_MEMBERSHIPS = [
  { org_id: ORG_ID, member_id: USERS.admin.id, role: 'admin' },
  { org_id: ORG_ID, member_id: USERS.agent.id, role: 'agent' },
  { org_id: ORG_ID, member_id: USERS.customer.id, role: 'customer' },
]

const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const anonAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const tokenCache = new Map()
const clientCache = new Map()

async function ensureBaselineData() {
  const { error: orgError } = await serviceClient
    .from('organizations')
    .upsert(BASE_ORG, { onConflict: 'id' })

  if (orgError) {
    throw new Error(`Failed to seed organization: ${orgError.message}`)
  }

  const { error: membershipsError } = await serviceClient
    .from('memberships')
    .upsert(BASE_MEMBERSHIPS, { onConflict: 'org_id,member_id' })

  if (membershipsError) {
    throw new Error(`Failed to seed memberships: ${membershipsError.message}`)
  }
}

async function fetchAccessToken(role) {
  if (tokenCache.has(role)) {
    return tokenCache.get(role)
  }

  const user = USERS[role]
  if (!user) {
    throw new Error(`Unknown role: ${role}`)
  }

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })

  if (error) {
    throw new Error(`Failed to generate OTP for ${role}: ${error.message}`)
  }

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
    throw new Error(
      `Failed to verify OTP for ${role}: ${verifyResponse.error.message}`,
    )
  }

  const accessToken = verifyResponse.data.session?.access_token

  if (!accessToken) {
    throw new Error(`No access token returned for ${role}`)
  }

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
  if (clientCache.has(role)) {
    return clientCache.get(role)
  }

  const token = await fetchAccessToken(role)
  const client = createUserClient(token)
  clientCache.set(role, client)
  return client
}

async function findMembership(memberId) {
  const { data, error } = await serviceClient
    .from('memberships')
    .select('org_id, member_id, role')
    .eq('org_id', ORG_ID)
    .eq('member_id', memberId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Membership lookup failed: ${error.message}`)
  }

  return data ?? null
}

async function runTest(name, testFn) {
  try {
    const message = await testFn()
    console.log(`PASS ${name}${message ? ` - ${message}` : ''}`)
    return true
  } catch (error) {
    console.error(`FAIL ${name} - ${error.message ?? error}`)
    return false
  }
}

await ensureBaselineData()

const results = []

results.push(
  await runTest('customer can read org members', async () => {
    const client = await getUserClient('customer')
    const { data, error } = await client.rpc('get_org_members', { p_org: ORG_ID })

    if (error) {
      throw new Error(`get_org_members failed: ${error.message}`)
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No memberships returned')
    }

    const customerEntry = data.find((row) => row.member_id === USERS.customer.id)

    if (!customerEntry) {
      throw new Error('Customer membership missing from response')
    }

    return `${data.length} memberships visible`
  }),
)

results.push(
  await runTest('agent can read org members', async () => {
    const client = await getUserClient('agent')
    const { data, error } = await client.rpc('get_org_members', { p_org: ORG_ID })

    if (error) {
      throw new Error(`get_org_members failed: ${error.message}`)
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No memberships returned')
    }

    const agentEntry = data.find((row) => row.member_id === USERS.agent.id)

    if (!agentEntry) {
      throw new Error('Agent membership missing from response')
    }

    return `${data.length} memberships visible`
  }),
)

results.push(
  await runTest('admin can update agent role', async () => {
    const client = await getUserClient('admin')
    const { error } = await client.rpc('update_member_role', {
      p_org: ORG_ID,
      p_target: USERS.agent.id,
      p_role: 'agent',
    })

    if (error) {
      throw new Error(`update_member_role failed: ${error.message}`)
    }

    const membership = await findMembership(USERS.agent.id)

    if (!membership) {
      throw new Error('Agent membership missing after update')
    }

    if (membership.role !== 'agent') {
      throw new Error(`Agent role is ${membership.role} after update`)
    }

    return 'Agent role unchanged as expected'
  }),
)

results.push(
  await runTest('customer cannot delete members', async () => {
    const client = await getUserClient('customer')
    const response = await client.rpc('delete_member', {
      p_org: ORG_ID,
      p_target: USERS.agent.id,
    })

    if (!response.error) {
      await ensureBaselineData()
      throw new Error('delete_member succeeded for customer')
    }

    const membership = await findMembership(USERS.agent.id)

    if (!membership) {
      await ensureBaselineData()
      throw new Error('Agent membership removed by customer action')
    }

    return `Denied with: ${response.error.message}`
  }),
)

results.push(
  await runTest('admin can delete members', async () => {
    const client = await getUserClient('admin')
    const { error } = await client.rpc('delete_member', {
      p_org: ORG_ID,
      p_target: USERS.agent.id,
    })

    if (error) {
      throw new Error(`delete_member failed: ${error.message}`)
    }

    const membership = await findMembership(USERS.agent.id)

    if (membership) {
      throw new Error('Agent membership still exists after delete')
    }

    await ensureBaselineData()
    return 'Agent membership removed and restored'
  }),
)

const hasFailure = results.some((success) => !success)

if (hasFailure) {
  process.exitCode = 1
} else {
  console.log('All permission tests passed')
}
