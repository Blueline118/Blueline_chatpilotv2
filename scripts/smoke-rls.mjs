// scripts/smoke-rls.mjs
import fetch from "node-fetch";

const baseUrl = "http://localhost:9999/.netlify/functions";

async function call(endpoint, token, method = "POST", body = {}) {
  const res = await fetch(`${baseUrl}/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  const adminToken = process.env.ADMIN_ACCESS_TOKEN;
  const userToken = process.env.USER_ACCESS_TOKEN;
  const orgId = process.env.ORG_ID;
  const targetUserId = process.env.TARGET_USER_ID;

  console.log("=== updateMemberRole as ADMIN ===");
  console.log(
    await call("updateMemberRole", adminToken, "POST", {
      p_org: orgId,
      p_target: targetUserId,
      p_role: "TEAM",
    })
  );

  console.log("=== updateMemberRole as USER ===");
  console.log(
    await call("updateMemberRole", userToken, "POST", {
      p_org: orgId,
      p_target: targetUserId,
      p_role: "TEAM",
    })
  );

  console.log("=== deleteMember as ADMIN (dry-run) ===");
  console.log(
    await call("deleteMember", adminToken, "POST", {
      p_org: orgId,
      p_target: targetUserId,
    })
  );

  console.log("=== deleteMember as USER ===");
  console.log(
    await call("deleteMember", userToken, "POST", {
      p_org: orgId,
      p_target: targetUserId,
    })
  );
}

main().catch((err) => {
  console.error("Smoke test failed", err);
  process.exit(1);
});
