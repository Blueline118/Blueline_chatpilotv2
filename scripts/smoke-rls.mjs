#!/usr/bin/env node
import process from 'node:process';

const REQUIRED_ENVS = ['RLS_BASE_URL', 'RLS_USER_TOKEN', 'RLS_ORG_ID', 'RLS_TARGET_ID'];
const missing = REQUIRED_ENVS.filter((key) => !process.env[key] || !process.env[key]?.trim());

if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  console.error(
    '\nStel bijvoorbeeld in:\n' +
      '  export RLS_BASE_URL="http://localhost:8888"\n' +
      '  export RLS_USER_TOKEN="<supabase_user_jwt>"\n' +
      '  export RLS_ORG_ID="<org_uuid>"\n' +
      '  export RLS_TARGET_ID="<target_user_uuid>"\n' +
      '  export RLS_ROLE="TEAM"\n' +
      '  export RLS_SKIP_DELETE="1"  # optioneel, om delete te skippen'
  );
  process.exit(1);
}

const BASE_URL = process.env.RLS_BASE_URL;
const USER_TOKEN = process.env.RLS_USER_TOKEN;
const ORG_ID = process.env.RLS_ORG_ID;
const TARGET_ID = process.env.RLS_TARGET_ID;
const ROLE = process.env.RLS_ROLE || 'TEAM';
const SKIP_DELETE = process.env.RLS_SKIP_DELETE === '1';

async function callEndpoint(name, payload) {
  const url = new URL(`/.netlify/functions/${name}`, BASE_URL);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${USER_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || (data && typeof data === 'object' && data.error)) {
    const message =
      (data && typeof data === 'object' && typeof data.error === 'string' && data.error) ||
      (data && typeof data === 'object' && data.error && typeof data.error.message === 'string' && data.error.message) ||
      resp.statusText ||
      'Onbekende fout';
    const error = new Error(message);
    error.code = (data && typeof data === 'object' && data.code) || resp.status;
    error.response = data;
    throw error;
  }

  return data;
}

async function main() {
  console.log('→ updateMemberRole rooktest');
  try {
    const res = await callEndpoint('updateMemberRole', {
      p_org: ORG_ID,
      p_target: TARGET_ID,
      p_role: ROLE,
    });
    console.log('  ✓ update_member_role OK', res);
  } catch (error) {
    console.error('  ✗ update_member_role failed', error.message, error.response ?? '');
    process.exitCode = 1;
  }

  if (SKIP_DELETE) {
    console.log('→ deleteMember rooktest overgeslagen (RLS_SKIP_DELETE=1)');
    return;
  }

  console.log('→ deleteMember rooktest');
  try {
    const res = await callEndpoint('deleteMember', {
      p_org: ORG_ID,
      p_target: TARGET_ID,
    });
    console.log('  ✓ delete_member OK', res);
  } catch (error) {
    console.error('  ✗ delete_member failed', error.message, error.response ?? '');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Onverwachte fout in rooktest:', err);
  process.exit(1);
});
