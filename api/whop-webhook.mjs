// POST /api/whop-webhook
// Receives Whop purchase events, validates HMAC signature, ZADDs a revenue event to
// acmi:thread:revenue:timeline so the fleet sees real money flow.
//
// Whop signs current requests with Standard Webhooks headers:
// `webhook-id`, `webhook-timestamp`, `webhook-signature`.
// Older Stripe-style `whop-signature: t=<unix>,v1=<hex>` is kept as fallback.
//
// Env required:
//   WHOP_WEBHOOK_SECRET   — set in Vercel env after creating the webhook in Whop
//                           dashboard. If absent we run in dev-mode (logs + ZADD)
//                           without signature verification.
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

import crypto from "node:crypto";
import { restEndpoint } from "./_lib/redis.mjs";
import {
  ensureLabBuyerSecrets,
  extractBuyerIds,
  isLabEntryPurchase,
} from "./_lib/lab-buyer-secrets.mjs";

export const config = { runtime: "nodejs" };

const REVENUE_THREAD_MADEZ = "acmi:madez:thread:revenue:timeline";
const REVENUE_THREAD_LEGACY = "acmi:thread:revenue:timeline";

async function upstash(...cmd) {
  const url = restEndpoint(
    process.env.ACMI_BRIDGE_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  );
  const token = process.env.ACMI_BRIDGE_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("missing Polar exec / UPSTASH creds in env");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`Redis REST ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(`Redis REST: ${d.error}`);
  return d.result;
}

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function firstHeader(headers, name) {
  const value = headers?.[name] || headers?.[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : (value || "");
}

function timingSafeEqualString(a, b, encoding = "utf8") {
  const left = Buffer.from(String(a), encoding);
  const right = Buffer.from(String(b), encoding);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function standardWebhookSecretKeys(secret) {
  const keys = [Buffer.from(secret, "utf8")];
  if (String(secret).startsWith("whsec_")) {
    try {
      const decoded = Buffer.from(String(secret).slice("whsec_".length), "base64");
      if (decoded.length > 0) keys.push(decoded);
    } catch {
      /* ignore malformed whsec_ base64 fallback */
    }
  }
  return keys;
}

export function verifyStandardWhopSignature(rawBody, headers, secret, nowMs = Date.now()) {
  if (!secret) return { ok: true, mode: "dev-no-secret" };
  const id = firstHeader(headers, "webhook-id");
  const timestamp = firstHeader(headers, "webhook-timestamp");
  const signatureHeader = firstHeader(headers, "webhook-signature");
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: "missing-standard-signature" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "malformed-standard-timestamp" };
  const ageSec = Math.abs(Math.floor(nowMs / 1000) - ts);
  if (ageSec > 300) return { ok: false, reason: "stale-timestamp" };

  const signed = `${id}.${timestamp}.${rawBody}`;
  const candidates = String(signatureHeader)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, sig] = part.split(",");
      return version === "v1" ? sig : null;
    })
    .filter(Boolean);
  if (candidates.length === 0) return { ok: false, reason: "malformed-standard-signature" };

  for (const key of standardWebhookSecretKeys(secret)) {
    const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
    for (const candidate of candidates) {
      if (timingSafeEqualString(expected, candidate, "utf8")) return { ok: true, mode: "standard" };
    }
  }
  return { ok: false, reason: "signature-mismatch" };
}

export function verifyLegacyWhopSignature(rawBody, signatureHeader, secret, nowMs = Date.now()) {
  if (!signatureHeader || !secret) return { ok: false, reason: "missing-signature-or-secret" };
  // Legacy format: "t=<unix>,v1=<hex>" (Stripe-style)
  const parts = signatureHeader.split(",").reduce((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const t = parts.t;
  const v1 = parts.v1 || parts.signature;
  if (!t || !v1) return { ok: false, reason: "malformed-signature-header" };
  const signed = `${t}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  try {
    const matches = timingSafeEqualString(expected, v1, "hex");
    if (!matches) return { ok: false, reason: "signature-mismatch" };
    // Reject events older than 5 minutes to prevent replays
    const ageSec = Math.abs(Math.floor(nowMs / 1000) - Number(t));
    if (Number.isFinite(ageSec) && ageSec > 300) return { ok: false, reason: "stale-timestamp" };
    return { ok: true, mode: "stripe-legacy" };
  } catch {
    return { ok: false, reason: "signature-buffer-mismatch" };
  }
}

export function verifyWhopSignature(rawBody, headers, secret, nowMs = Date.now()) {
  if (!secret) return { ok: true, mode: "dev-no-secret" };
  const standard = verifyStandardWhopSignature(rawBody, headers, secret, nowMs);
  if (standard.ok) return standard;

  const legacyHeader =
    firstHeader(headers, "whop-signature") ||
    firstHeader(headers, "x-whop-signature");
  if (legacyHeader) return verifyLegacyWhopSignature(rawBody, legacyHeader, secret, nowMs);
  return standard;
}

function hashEmail(email) {
  if (!email) return null;
  return crypto.createHash("sha256").update(String(email).toLowerCase().trim()).digest("hex").slice(0, 16);
}

function inferTier(payload) {
  if (isLabEntryPurchase(payload, "")) return "lab";
  // Whop payload shapes vary by event type. Best-effort tier inference.
  const productName = (
    payload?.product?.name ||
    payload?.plan?.name ||
    payload?.data?.product?.name ||
    payload?.data?.plan?.name ||
    ""
  ).toLowerCase();
  if (productName.includes("starter")) return "starter-kit";
  if (productName.includes("lab")) return "lab";
  if (productName.includes("enterprise")) return "enterprise";
  return "unknown";
}

function inferAmount(payload) {
  // Whop typically sends amount in cents under various shapes
  const cents =
    payload?.amount ??
    payload?.total ??
    payload?.data?.amount ??
    payload?.data?.total ??
    payload?.payment?.amount ??
    null;
  if (typeof cents === "number") return cents / 100;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return reply(res, 405, { error: "method not allowed" });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    return reply(res, 200, { ok: false, reason: "body-read-failed", detail: String(e.message || e) });
  }

  const secret = process.env.WHOP_WEBHOOK_SECRET || "";

  const verification = verifyWhopSignature(rawBody, req.headers || {}, secret);
  if (!verification.ok) {
    return reply(res, 200, { ok: false, reason: verification.reason });
  }
  const signatureMode = verification.mode || "verified";

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return reply(res, 200, { ok: false, reason: "invalid-json-body" });
  }

  const eventType =
    payload?.type ||
    payload?.event ||
    payload?.action ||
    "unknown";

  const tier = inferTier(payload);
  const amount = inferAmount(payload);
  const buyerEmail =
    payload?.user?.email ||
    payload?.member?.email ||
    payload?.customer?.email ||
    payload?.data?.user?.email ||
    null;
  const buyerEmailHash = hashEmail(buyerEmail);
  const whopMemberId =
    payload?.user?.id ||
    payload?.member?.id ||
    payload?.data?.user?.id ||
    payload?.data?.member?.id ||
    null;

  // Map Whop event type → ACMI kind + correlationId prefix.
  // Whop sends e.g. "payment.succeeded", "membership.went_valid",
  // "membership.went_invalid", "subscription.created", "subscription.cancelled".
  const et = String(eventType).toLowerCase();
  let kind = "purchase";
  let cidPrefix = "whopPurchase";
  let summaryVerb = "purchase";
  if (et.includes("cancel") || et.includes("went_invalid") || et.includes("subscription.deleted")) {
    kind = "subscription-cancelled";
    cidPrefix = "whopSubCancelled";
    summaryVerb = "sub-cancelled";
  } else if (et.includes("subscription") || et.includes("membership.went_valid") || et.includes("recurring")) {
    kind = "subscription-created";
    cidPrefix = "whopSubCreated";
    summaryVerb = "sub-created";
  }

  const ts = Date.now();
  const tierSlug = tier.replace(/[^a-zA-Z0-9]/g, "");
  const correlationId = `${cidPrefix}${tierSlug}-${ts}`;

  const event = {
    ts,
    source: "whop:webhook",
    kind,
    correlationId,
    summary: `[${summaryVerb} ${tier} @mikey] ${amount ? `$${amount}` : "amount?"} via Whop · event=${eventType} · sig=${signatureMode}`,
    payload: {
      tier,
      amount_usd: amount,
      buyer_email_hash: buyerEmailHash,
      whop_member_id: whopMemberId,
      whop_event_type: eventType,
      signature_mode: signatureMode,
      raw_keys: Object.keys(payload || {}).slice(0, 30),
    },
    tags: ["whop", kind, "revenue", tier],
  };

  let labProvision = null;
  if (isLabEntryPurchase(payload, tier)) {
    const ids = extractBuyerIds(payload);
    const buyerId = ids.whopUserId || whopMemberId;
    try {
      labProvision = await ensureLabBuyerSecrets(buyerId, {
        membershipId: ids.membershipId,
        planId: ids.planId,
        productId: ids.productId,
        correlationId: `labBuyerSecrets-${ts}`,
      });
    } catch (e) {
      labProvision = { ok: false, error: String(e.message || e) };
    }
  }

  try {
    const encoded = JSON.stringify(event);
    await upstash("ZADD", REVENUE_THREAD_MADEZ, String(ts), encoded);
    try {
      await upstash("ZADD", REVENUE_THREAD_LEGACY, String(ts), encoded);
    } catch {
      /* legacy unprefixed key is best-effort */
    }
    return reply(res, 200, {
      ok: true,
      kind,
      correlationId,
      tier,
      amount_usd: amount,
      signature_mode: signatureMode,
      lab_provision: labProvision,
    });
  } catch (e) {
    return reply(res, 200, { ok: false, reason: "acmi-save-failed", detail: String(e.message || e) });
  }
}
