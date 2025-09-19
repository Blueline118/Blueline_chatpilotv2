#!/usr/bin/env node
import process from 'node:process';

const DEFAULT_BASE_URL = 'http://localhost:9999/.netlify/functions';
const BASE_URL = (process.env.RLS_BASE_URL || process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || process.env.RLS_ADMIN_TOKEN;
const USER_TOKEN = process.env.USER_ACCESS_TOKEN || process.env.RLS_USER_TOKEN;
const ORG_ID = process.env.ORG_ID || process.env.RLS_ORG_ID;
const TARGET_USER_ID = process.env.TARGET_USER_ID || process.env.RLS_TARGET_ID;
const ROLE = process.env.RLS_ROLE || process.env.SMOKE_ROLE || 'TEAM';
const SKIP_DELETE = process.env.RLS_SKIP_DELETE === '1' || process.env.SMOKE_SKIP_DELETE === '1';

const REQUIRED_ENVS = [
  ['ADMIN_ACCESS_TOKEN', ADMIN_TOKEN],
  ['USER_ACCESS_TOKEN', USER_TOKEN],
  ['ORG_ID', ORG_ID],
  ['TARGET_USER_ID', TARGET_USER_ID],
];

const missing = REQUIRED_ENVS.filter(([, value]) => !value || !String(value).trim()).map(([key]) => key);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  console.error('\nExample usage:');
  console.error('  export ADMIN_ACCESS_TOKEN="<admin_jwt>"');
  console.error('  export USER_ACCESS_TOKEN="<member_jwt>"');
  console.error('  export ORG_ID="<org_uuid>"');
  console.error('  export TARGET_USER_ID="<target_user_uuid>"');
  console.error('  export RLS_BASE_URL="http://localhost:9999/.netlify/functions"  # optional');
  console.error('  node scripts/smoke-rls.mjs');
  process.exit(1);
}

function endpointUrl(name) {
  return `${BASE_URL}/${name}`;
}

async function request(name, { method = 'POST', token, body } = {}) {
  const init = { method, headers: {} };
  if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  if (token) init.headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpointUrl(name), init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, json };
}

function logResult(ok, label, message) {
  if (ok) {
    console.log(`  ✓ ${label}${message ? ` — ${message}` : ''}`);
  } else {
    console.error(`  ✗ ${label}${message ? ` — ${message}` : ''}`);
  }
}

async function main() {
  console.log('Smoke test base URL:', BASE_URL);

  // Admin updateMemberRole (should succeed)
  console.log('\n→ ADMIN updateMemberRole');
  try {
    const { response, json } = await request('updateMemberRole', {
      token: ADMIN_TOKEN,
      body: { p_org: ORG_ID, p_target: TARGET_USER_ID, p_role: ROLE },
    });
    const ok = response.ok && response.status === 200;
    logResult(ok, 'Admin can update role', `status ${response.status}`);
    if (!ok) {
      console.error('    Response body:', json);
      process.exitCode = 1;
    }
  } catch (error) {
    logResult(false, 'Admin can update role', error.message);
    process.exitCode = 1;
  }

  // Member updateMemberRole (should be denied)
  console.log('\n→ MEMBER updateMemberRole (expect 401/403)');
  try {
    const { response, json } = await request('updateMemberRole', {
      token: USER_TOKEN,
      body: { p_org: ORG_ID, p_target: TARGET_USER_ID, p_role: ROLE },
    });
    const denied = !response.ok && [401, 403].includes(response.status);
    logResult(denied, 'Member blocked from updating role', `status ${response.status}`);
    if (!denied) {
      console.error('    Response body:', json);
      process.exitCode = 1;
    }
  } catch (error) {
    logResult(false, 'Member blocked from updating role', error.message);
    process.exitCode = 1;
  }

  // Missing token updateMemberRole (should be denied)
  console.log('\n→ No token updateMemberRole (expect 401)');
  try {
    const { response, json } = await request('updateMemberRole', {
      body: { p_org: ORG_ID, p_target: TARGET_USER_ID, p_role: ROLE },
    });
    const denied = !response.ok && response.status === 401;
    logResult(denied, 'Missing token rejected', `status ${response.status}`);
    if (!denied) {
      console.error('    Response body:', json);
      process.exitCode = 1;
    }
  } catch (error) {
    logResult(false, 'Missing token rejected', error.message);
    process.exitCode = 1;
  }

  if (SKIP_DELETE) {
    console.log('\n→ ADMIN deleteMember (skipped: RLS_SKIP_DELETE=1)');
  } else {
    console.log('\n→ ADMIN deleteMember');
    try {
      const { response, json } = await request('deleteMember', {
        token: ADMIN_TOKEN,
        body: { p_org: ORG_ID, p_target: TARGET_USER_ID },
      });
      const ok = response.ok && response.status === 200;
      logResult(ok, 'Admin can delete member', `status ${response.status}`);
      if (!ok) {
        console.error('    Response body:', json);
        process.exitCode = 1;
      }
    } catch (error) {
      logResult(false, 'Admin can delete member', error.message);
      process.exitCode = 1;
    }
  }

  console.log('\n→ OPTIONS preflight updateMemberRole');
  try {
    const { response } = await request('updateMemberRole', { method: 'OPTIONS' });
    const allowOrigin = response.headers.get('access-control-allow-origin');
    const ok = (response.status === 200 || response.status === 204) && !!allowOrigin;
    logResult(ok, 'Preflight returns CORS headers', `status ${response.status}, allow-origin=${allowOrigin}`);
    if (!ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    logResult(false, 'Preflight returns CORS headers', error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Unexpected smoke test failure:', error);
  process.exit(1);
});
