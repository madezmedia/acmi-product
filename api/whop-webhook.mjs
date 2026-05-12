// POST /api/whop-webhook
// Receives Whop purchase events, validates HMAC signature, ZADDs a revenue event to
// acmi:thread:revenue:timeline so the fleet sees real money flow.
//
// Whop signs requests with HMAC-SHA256 using the webhook secret configured in the
// Whop dashboard. Header: `whop-signature: t=<unix>,v1=<hmac>` (Stripe-style).
// We compute the same and compare in constant time.
//
// Env required:
//   WHOP_WEBHOOK_SECRET   — set in Vercel env after creating the webhook in Whop
//                           dashboard. If absent we run in dev-mode (logs + ZADD)
//                           without signature verification.
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

import crypto from "node:crypto";
import { resolveInstance, redis, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "nodejs" };

const REVENUE_THREAD = "acmi:thread:revenue:timeline";

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

function verifyWhopSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return { ok: false, reason: "missing-signature-or-secret" };
  // Whop format: "t=<unix>,v1=<hex>" (Stripe-style)
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
    const matches = crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(v1, "hex"),
    );
    if (!matches) return { ok: false, reason: "signature-mismatch" };
    // Reject events older than 5 minutes to prevent replays
    const ageSec = Math.floor(Date.now() / 1000) - Number(t);
    if (Number.isFinite(ageSec) && ageSec > 300) return { ok: false, reason: "stale-timestamp" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "signature-buffer-mismatch" };
  }
}

function hashEmail(email) {
  if (!email) return null;
  return crypto.createHash("sha256").update(String(email).toLowerCase().trim()).digest("hex").slice(0, 16);
}

function inferTier(payload) {
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
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "could not read body", detail: String(e.message || e) }));
    return;
  }

  const secret = process.env.WHOP_WEBHOOK_SECRET || "";
  const signatureHeader =
    req.headers["whop-signature"] || req.headers["x-whop-signature"] || "";

  let signatureMode = "verified";
  if (secret) {
    const v = verifyWhopSignature(rawBody, signatureHeader, secret);
    if (!v.ok) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "invalid signature", reason: v.reason }));
      return;
    }
  } else {
    signatureMode = "dev-no-secret";
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "invalid JSON body" }));
    return;
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

  const ts = Date.now();
  const correlationId = `whopPurchase${tier.replace(/[^a-zA-Z0-9]/g, "")}-${ts}`;

  const event = {
    ts,
    source: "whop:webhook",
    kind: "purchase",
    correlationId,
    summary: `[purchase ${tier} @mikey] ${amount ? `$${amount}` : "amount?"} via Whop · event=${eventType} · sig=${signatureMode}`,
    payload: {
      tier,
      amount_usd: amount,
      buyer_email_hash: buyerEmailHash,
      whop_member_id: whopMemberId,
      whop_event_type: eventType,
      signature_mode: signatureMode,
      raw_keys: Object.keys(payload || {}).slice(0, 30),
    },
    tags: ["whop", "purchase", "revenue", tier],
  };

  try {
    const instance = resolveInstance(req);
    await redis(instance, "ZADD", REVENUE_THREAD, String(ts), JSON.stringify(event));
    return json({ ok: true, correlationId, tier, amount_usd: amount, signature_mode: signatureMode });
  } catch (e) {
    return err(`failed to ZADD revenue event: ${e.message}`);
  }
}
