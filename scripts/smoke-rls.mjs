#!/usr/bin/env node
import process from 'node:process';

const BASE_URL_RAW = process.env.BASE_URL || 'http://localhost:9999/.netlify/functions';
const BASE_URL = BASE_URL_RAW.endsWith('/') ? BASE_URL_RAW : `${BASE_URL_RAW}/`;
const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_TOKEN = process.env.USER_ACCESS_TOKEN;
const ORG_ID = process.env.ORG_ID;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const TARGET_ROLE = process.env.TARGET_ROLE || 'TEAM';

const missing = [];
if (!ADMIN_TOKEN) missing.push('ADMIN_ACCESS_TOKEN');
if (!USER_TOKEN) missing.push('USER_ACCESS_TOKEN');
if (!ORG_ID) missing.push('ORG_ID');
if (!TARGET_USER_ID) missing.push('TARGET_USER_ID');

if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  console.error('\nExample configuration:');
  console.error('  export BASE_URL="http://localhost:9999/.netlify/functions"');
  console.error('  export ADMIN_ACCESS_TOKEN="<admin_jwt>"');
  console.error('  export USER_ACCESS_TOKEN="<user_jwt>"');
  console.error('  export ORG_ID="<org_uuid>"');
  console.error('  export TARGET_USER_ID="<target_user_uuid>"');
  console.error('  export TARGET_ROLE="TEAM"  # optional');
  process.exit(1);
}

function decodeJwtUserId(token) {
  try {
    const segments = token.split('.');
    if (segments.length < 2) return null;
    let payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return json.sub || json.user_id || json.user?.id || null;
  } catch (error) {
    return null;
  }
}

const USER_ID = decodeJwtUserId(USER_TOKEN);
if (!USER_ID) {
  console.error('Unable to determine user id from USER_ACCESS_TOKEN payload.');
  process.exit(1);
}

function urlFor(path) {
  return new URL(path, BASE_URL).toString();
}

async function requestJson(path, init = {}) {
  const response = await fetch(urlFor(path), init);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { response, data };
}

function logResult(ok, message, details) {
  const prefix = ok ? '✔' : '✖';
  const output = details ? `${message} ${details}` : message;
  (ok ? console.log : console.error)(`${prefix} ${output}`);
  if (!ok) {
    process.exitCode = 1;
  }
}

function randomInviteEmail() {
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `smoke-invite+${stamp}-${suffix}@example.com`;
}

async function testPreflight() {
  const { response } = await requestJson('listMemberships', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization, Content-Type',
    },
  });

  const ok = response.status === 200;
  const allowOrigin = response.headers.get('access-control-allow-origin');
  logResult(ok, 'OPTIONS preflight listMemberships', ok ? `(status ${response.status}, allow-origin=${allowOrigin ?? 'n/a'})` : `status ${response.status}`);
}

async function testAdminList() {
  const { response, data } = await requestJson(`listMemberships?org_id=${encodeURIComponent(ORG_ID)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  const hasEmail = items.some((item) => typeof item?.email === 'string' && item.email.length > 0);
  const ok = response.ok && hasEmail;
  logResult(ok, 'Admin listMemberships', ok ? `(items=${items.length}, email detected)` : `status ${response.status}`);
}

async function testAdminUpdate() {
  const { response, data } = await requestJson('updateMemberRole', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ p_org: ORG_ID, p_target: TARGET_USER_ID, p_role: TARGET_ROLE }),
  });

  const ok = response.ok && data && typeof data === 'object' && data.ok === true;
  logResult(ok, 'Admin updateMemberRole', ok ? '(200 OK)' : `status ${response.status}`);
}

async function testUserUpdate() {
  const { response, data } = await requestJson('updateMemberRole', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${USER_TOKEN}`,
    },
    body: JSON.stringify({ p_org: ORG_ID, p_target: TARGET_USER_ID, p_role: TARGET_ROLE }),
  });

  const deniedStatus = response.status === 401 || response.status === 403;
  const payloadError = data && typeof data === 'object' && typeof data.error === 'string';
  const ok = deniedStatus || payloadError;
  logResult(ok, 'User updateMemberRole denied', `(status ${response.status})`);
}

async function testUnauthUpdate() {
  const { response } = await requestJson('updateMemberRole', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_org: ORG_ID, p_target: TARGET_USER_ID, p_role: TARGET_ROLE }),
  });

  const ok = response.status === 401 || response.status === 403;
  logResult(ok, 'Unauthenticated updateMemberRole denied', `(status ${response.status})`);
}

async function testAdminCreateInvite() {
  const inviteEmail = randomInviteEmail();
  const { response, data } = await requestJson('createInvite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ p_org: ORG_ID, p_email: inviteEmail, p_role: 'CUSTOMER' }),
  });

  const acceptUrl = typeof data?.acceptUrl === 'string' ? data.acceptUrl : null;
  const sent = data?.sent === true;
  const ok = response.ok && (acceptUrl || sent);
  const details = ok ? (acceptUrl ? '(acceptUrl ontvangen)' : '(mail verstuurd)') : `status ${response.status}`;
  logResult(ok, 'Admin createInvite', details);
  return ok ? { acceptUrl, email: inviteEmail, sent } : null;
}

async function testUserCreateInviteDenied() {
  const { response, data } = await requestJson('createInvite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${USER_TOKEN}`,
    },
    body: JSON.stringify({ p_org: ORG_ID, p_email: randomInviteEmail(), p_role: 'TEAM' }),
  });

  const denied = response.status === 401 || response.status === 403 || (data && typeof data.error === 'string');
  logResult(denied, 'User createInvite denied', `(status ${response.status})`);
}

async function testAcceptInvite(invite) {
  if (!invite || !invite.acceptUrl) {
    logResult(false, 'Accept invite', '(geen invite URL beschikbaar)');
    return;
  }
  let token;
  try {
    const url = new URL(invite.acceptUrl);
    token = url.searchParams.get('token');
  } catch (error) {
    token = null;
  }
  if (!token) {
    logResult(false, 'Accept invite', '(token ontbreekt)');
    return;
  }

  const { response, data } = await requestJson(`acceptInvite?token=${encodeURIComponent(token)}&noRedirect=1`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${USER_TOKEN}`,
    },
  });

  const ok = response.status === 200 && data && data.success === true;
  logResult(ok, 'Accept invite', ok ? '(200 OK)' : `status ${response.status}`);
  if (!ok) return;

  const { response: listRes, data: listData } = await requestJson(`listMemberships?org_id=${encodeURIComponent(ORG_ID)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  });
  const items = Array.isArray(listData?.items) ? listData.items : [];
  const hasMembership = items.some((item) => item.user_id === USER_ID);
  logResult(hasMembership, 'Membership exists after accept', hasMembership ? '' : `(status ${listRes.status})`);
}

async function main() {
  await testPreflight();
  await testAdminList();
  await testAdminUpdate();
  await testUserUpdate();
  await testUnauthUpdate();
  const invite = await testAdminCreateInvite();
  await testUserCreateInviteDenied();
  await testAcceptInvite(invite);
}

main().catch((err) => {
  console.error('✖ Unexpected smoke test error', err);
  process.exit(1);
});
