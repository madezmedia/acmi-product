// ensure_lab_buyer_secrets — Lab Entry provision hook (Infra §6 + Coding call site).
//
// Hard rule: never embed fleet-services / Folana / Mattermost / fleet Redis write
// tokens. Buyer path is /lab-buyers/<whop_user_id>/ names-only keys only.
// Secret values are written to Infisical when UA env is present; ACMI only
// stores the path + ids (no secret material).

import { restEndpoint } from "./redis.mjs";

export const LAB_PRODUCT_ID = "prod_W2AW7G0vsy4Dw";
export const LAB_ENTRY_PLAN_ID = "plan_TwYRNmhv585q0";

function redisUrl() {
  return restEndpoint(
    process.env.ACMI_BRIDGE_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      "https://acmi-redis-u70402.vm.elestio.app/bridge/exec",
  );
}

function redisToken() {
  return process.env.ACMI_BRIDGE_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "vm-local-bridge";
}

async function redis(...cmd) {
  const r = await fetch(redisUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(`redis: ${d.error}`);
  return d.result;
}

function pickId(payload) {
  return (
    payload?.user?.id ||
    payload?.member?.id ||
    payload?.data?.user?.id ||
    payload?.data?.member?.id ||
    payload?.user_id ||
    payload?.data?.user_id ||
    null
  );
}

function pickMembershipId(payload) {
  return (
    payload?.membership?.id ||
    payload?.data?.membership?.id ||
    payload?.data?.id ||
    payload?.id ||
    payload?.membership_id ||
    null
  );
}

function pickPlanId(payload) {
  return (
    payload?.plan_id ||
    payload?.plan?.id ||
    payload?.data?.plan_id ||
    payload?.data?.plan?.id ||
    payload?.data?.product_id ||
    payload?.product_id ||
    payload?.product?.id ||
    payload?.data?.product?.id ||
    null
  );
}

export function isLabEntryPurchase(payload, tier) {
  if (String(tier || "").toLowerCase() === "lab") return true;
  const ids = [
    payload?.product_id,
    payload?.plan_id,
    payload?.product?.id,
    payload?.plan?.id,
    payload?.data?.product_id,
    payload?.data?.plan_id,
    payload?.data?.product?.id,
    payload?.data?.plan?.id,
  ]
    .filter(Boolean)
    .map(String);
  return ids.includes(LAB_PRODUCT_ID) || ids.includes(LAB_ENTRY_PLAN_ID);
}

async function infisicalToken() {
  const api = (process.env.INFISICAL_API || "").replace(/\/+$/, "");
  const clientId = process.env.INFISICAL_FLEET_CLIENT_ID || "";
  const clientSecret = process.env.INFISICAL_FLEET_CLIENT_SECRET || "";
  if (!api || !clientId || !clientSecret) return null;
  const r = await fetch(`${api}/v1/auth/universal-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error(`infisical login ${r.status}`);
  const d = await r.json();
  if (!d.accessToken) throw new Error("infisical login missing accessToken");
  return { api, token: d.accessToken, workspaceId: process.env.INFISICAL_PROJECT_ID || "" };
}

async function infisicalEnsureFolder(auth, parentPath, name) {
  const r = await fetch(`${auth.api}/v1/folders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: auth.workspaceId,
      environment: "prod",
      name,
      path: parentPath,
    }),
  });
  if (r.ok) return "created";
  const t = await r.text();
  if (r.status === 400 || r.status === 409 || /already exists|duplicate/i.test(t)) return "exists";
  throw new Error(`infisical folder ${parentPath}/${name} ${r.status} ${t.slice(0, 180)}`);
}

async function infisicalUpsert(auth, path, key, value) {
  const body = {
    workspaceId: auth.workspaceId,
    environment: "prod",
    secretPath: path,
    secretValue: String(value),
    type: "shared",
  };
  const url = `${auth.api}/v3/secrets/raw/${encodeURIComponent(key)}`;
  const post = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (post.ok) return "created";
  const patch = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (patch.ok) return "updated";
  const t = await patch.text();
  throw new Error(`infisical upsert ${key} ${patch.status} ${t.slice(0, 180)}`);
}

/**
 * @param {string} whopUserId
 * @param {{ membershipId?: string, planId?: string, productId?: string, correlationId?: string }} extra
 * @returns {Promise<{ ok: boolean, path: string, source: string, clientId?: string, error?: string }>}
 */
export async function ensureLabBuyerSecrets(whopUserId, extra = {}) {
  const id = String(whopUserId || "").trim();
  if (!id) return { ok: false, path: null, source: "none", error: "missing whop_user_id" };
  const path = `/lab-buyers/${id}`;
  const ts = Date.now();
  const membershipId = extra.membershipId || null;
  const planId = extra.planId || LAB_ENTRY_PLAN_ID;
  const productId = extra.productId || LAB_PRODUCT_ID;
  const correlationId = extra.correlationId || `labBuyerSecrets-${ts}`;

  let source = "acmi-only";
  let infisicalError = null;
  try {
    const auth = await infisicalToken();
    if (auth) {
      await infisicalEnsureFolder(auth, "/", "lab-buyers");
      await infisicalEnsureFolder(auth, "/lab-buyers", id);
      await infisicalUpsert(auth, path, "WHOP_USER_ID", id);
      if (membershipId) await infisicalUpsert(auth, path, "WHOP_MEMBERSHIP_ID", membershipId);
      if (planId) await infisicalUpsert(auth, path, "WHOP_PLAN_ID", planId);
      if (productId) await infisicalUpsert(auth, path, "WHOP_PRODUCT_ID", productId);
      source = "infisical";
    }
  } catch (e) {
    infisicalError = e.message || String(e);
  }

  const profile = {
    acmi_version: "1.5",
    comms_protocol: "v1.5",
    comms_alignment: "active",
    actor_type: "external",
    tenant_id: "madez",
    id,
    namespace: "lab-buyer",
    secrets_path: path,
    secrets_source: source,
    whop_user_id: id,
    whop_membership_id: membershipId,
    whop_plan_id: planId,
    whop_product_id: productId,
    created_at: ts,
  };
  const signals = {
    status: "provisioned",
    secrets_path: path,
    secrets_source: source,
    updated_at: ts,
    correlationId,
  };
  const event = {
    ts,
    source: "whop:webhook",
    kind: "lab-buyer-provisioned",
    correlationId,
    acmi_version: "1.5",
    comms_protocol: "v1.5",
    comms_alignment: "active",
    actor_type: "system",
    tenant_id: "madez",
    summary: `[lab-buyer-provisioned @codex @ops-center] ${path} source=${source}${infisicalError ? " infisical_err=1" : ""}`,
  };

  try {
    await redis("SET", `acmi:madez:lab-buyer:${id}:profile`, JSON.stringify(profile));
    await redis("SET", `acmi:madez:lab-buyer:${id}:signals`, JSON.stringify(signals));
    await redis("ZADD", `acmi:madez:lab-buyer:${id}:timeline`, String(ts), JSON.stringify(event));
    await redis("ZADD", "acmi:madez:thread:agent-coordination:timeline", String(ts), JSON.stringify(event));
  } catch (e) {
    return {
      ok: false,
      path,
      source,
      clientId: id,
      error: `acmi write: ${e.message || e}`,
    };
  }

  return {
    ok: true,
    path,
    source,
    clientId: id,
    error: infisicalError || undefined,
  };
}

export function extractBuyerIds(payload) {
  return {
    whopUserId: pickId(payload),
    membershipId: pickMembershipId(payload),
    planId: pickPlanId(payload),
    productId:
      payload?.product_id ||
      payload?.product?.id ||
      payload?.data?.product_id ||
      payload?.data?.product?.id ||
      null,
  };
}
