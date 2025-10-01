#!/usr/bin/env node
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENVS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable ${key}`);
    process.exit(1);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORG_ID = '54ec8e89-d265-474d-98fc-d2ba579ac83f';
const USERS = {
  admin: 'b1a5b296-c0ed-43e7-a0af-2b716b69037f',
  team: '3e0be2af-d8ec-4780-9351-388503a8878c',
  customer: '221b77de-755d-4861-9944-a303c796663a',
};

const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const clientCache = new Map();
const emailCache = new Map();

function formatFailure(error) {
  if (!error) return { code: 'unknown', message: 'Unknown error' };
  if (error instanceof Error) {
    return { code: error.code ?? error.status ?? 'ERR', message: error.message };
  }
  return {
    code: error.code ?? error.status ?? 'ERR',
    message: error.message ?? JSON.stringify(error),
  };
}

async function fetchEmail(userId) {
  if (emailCache.has(userId)) return emailCache.get(userId);
  const { data, error } = await serviceClient.auth.admin.getUserById(userId);
  if (error) {
    throw Object.assign(new Error(`getUserById failed for ${userId}`), formatFailure(error));
  }
  const email = data?.user?.email;
  if (!email) {
    throw Object.assign(new Error(`No email for user ${userId}`), { code: 'NOEMAIL' });
  }
  emailCache.set(userId, email);
  return email;
}

async function createSessionClient(userId) {
  if (clientCache.has(userId)) return clientCache.get(userId);
  const email = await fetchEmail(userId);
  const { data, error } = await serviceClient.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) {
    throw Object.assign(new Error(`generateLink failed for ${userId}`), formatFailure(error));
  }
  const props = data?.properties;
  if (!props?.email_otp || !props?.verification_type) {
    throw Object.assign(new Error(`OTP data missing for ${userId}`), { code: 'NOOTP' });
  }
  const verify = await anonClient.auth.verifyOtp({
    email,
    token: props.email_otp,
    type: props.verification_type,
  });
  if (verify.error) {
    throw Object.assign(new Error(`verifyOtp failed for ${userId}`), formatFailure(verify.error));
  }
  const accessToken = verify.data.session?.access_token;
  if (!accessToken) {
    throw Object.assign(new Error(`No access token for ${userId}`), { code: 'NOTOKEN' });
  }
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  clientCache.set(userId, client);
  return client;
}

async function assertMembershipRole(userId, expectedRole) {
  const { data, error } = await serviceClient
    .from('memberships')
    .select('role')
    .eq('org_id', ORG_ID)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw Object.assign(new Error(`memberships lookup failed for ${userId}`), formatFailure(error));
  }
  const role = data?.role ? String(data.role).toUpperCase() : null;
  if (role !== expectedRole) {
    throw Object.assign(new Error(`Expected role ${expectedRole}, got ${role ?? 'null'}`), {
      code: 'BADROLE',
    });
  }
}

async function restoreMembership(userId, role) {
  const { error } = await serviceClient
    .from('memberships')
    .upsert({ org_id: ORG_ID, user_id: userId, role }, { onConflict: 'org_id,user_id' });
  if (error) {
    throw Object.assign(new Error(`Restore membership failed for ${userId}`), formatFailure(error));
  }
}

function logPass(step, message = '') {
  console.log(`PASS ${step}${message ? ` - ${message}` : ''}`);
}

function logFail(step, error) {
  const info = formatFailure(error);
  console.error(`FAIL ${step} - ${info.code}: ${info.message}`);
}

let success = true;

// Step A: admin updates team member role
try {
  const adminClient = await createSessionClient(USERS.admin);
  const { error } = await adminClient.rpc('admin_update_member_role', {
    p_org_id: ORG_ID,
    p_member_id: USERS.team,
    p_role: 'TEAM',
  });
  if (error) throw error;
  await assertMembershipRole(USERS.team, 'TEAM');
  logPass('ADMIN admin_update_member_role');
} catch (error) {
  success = false;
  logFail('ADMIN admin_update_member_role', error);
}

// Step B: customer forbidden to update
try {
  const customerClient = await createSessionClient(USERS.customer);
  const { error } = await customerClient.rpc('admin_update_member_role', {
    p_org_id: ORG_ID,
    p_member_id: USERS.team,
    p_role: 'TEAM',
  });
  if (!error) {
    throw Object.assign(new Error('Expected authorization error'), { code: 'EXPECTED_403' });
  }
  const status = error.status ?? Number(error.code);
  if (status !== 403 && error.code !== '42501') {
    throw Object.assign(new Error('Unexpected error response'), formatFailure(error));
  }
  logPass('CUSTOMER admin_update_member_role blocked', `${error.code ?? error.status}: ${error.message}`);
} catch (error) {
  success = false;
  logFail('CUSTOMER admin_update_member_role blocked', error);
}

// Step C: admin deletes customer member
try {
  const adminClient = await createSessionClient(USERS.admin);
  const { error } = await adminClient.rpc('admin_delete_member', {
    p_org_id: ORG_ID,
    p_member_id: USERS.customer,
  });
  if (error) throw error;
  const { data, error: lookupError } = await serviceClient
    .from('memberships')
    .select('user_id')
    .eq('org_id', ORG_ID)
    .eq('user_id', USERS.customer)
    .maybeSingle();
  if (lookupError) {
    throw Object.assign(new Error('Lookup after delete failed'), formatFailure(lookupError));
  }
  if (data) {
    throw Object.assign(new Error('Customer membership still present after delete'), { code: 'NOTDELETED' });
  }
  await restoreMembership(USERS.customer, 'CUSTOMER');
  logPass('ADMIN admin_delete_member', 'Membership removed and restored');
} catch (error) {
  success = false;
  try {
    await restoreMembership(USERS.customer, 'CUSTOMER');
  } catch (restoreError) {
    logFail('RESTORE membership fallback', restoreError);
  }
  logFail('ADMIN admin_delete_member', error);
}

if (!success) process.exit(1);
