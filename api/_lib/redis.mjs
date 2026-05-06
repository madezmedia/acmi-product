// Upstash REST client + multi-instance credential resolution.
// Server-side only. Never imported into client bundle.
//
// Multi-tenant model:
//   - default instance from UPSTASH_REDIS_REST_URL / _TOKEN
//   - additional instances via per-id env vars (URL_<ID> / TOKEN_<ID>),
//     where <ID> is uppercased and dashes→underscores (e.g. mz-prod → MZ_PROD)
//   - selection via cookie `acmi-instance=<id>` or query ?instance=<id>
//
// Read-only: api/* never writes to ACMI. All endpoints are GET-only.

export function resolveInstance(req) {
  const url = new URL(req.url);
  const queryId = url.searchParams.get("instance");
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieMatch = cookieHeader.match(/acmi-instance=([^;]+)/);
  const cookieId = cookieMatch?.[1];
  const id = (queryId || cookieId || "default").trim();

  if (id === "default") {
    return {
      id: "default",
      url: process.env.UPSTASH_REDIS_REST_URL || "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    };
  }

  const slug = id.toUpperCase().replace(/-/g, "_");
  return {
    id,
    url: process.env[`UPSTASH_URL_${slug}`] || process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env[`UPSTASH_TOKEN_${slug}`] || process.env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}

export async function redis(instance, ...cmd) {
  if (!instance.url || !instance.token) {
    throw new Error(`No credentials for instance "${instance.id}"`);
  }
  const endpoint = instance.url.replace(/\/$/, "") + "/";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${instance.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result;
}

// Try to JSON.parse a string; return original on failure.
export function tryParse(s) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

// Common JSON response with cache + CORS headers.
export function json(data, { sMaxage = 5, status = 200 } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, s-maxage=${sMaxage}, stale-while-revalidate=30`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function err(message, status = 500) {
  return json({ error: message, ts: Date.now() }, { sMaxage: 0, status });
}
