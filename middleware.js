/* Vercel middleware — Basic auth gate on /ops-center-v2/*
 *
 * Mikey's operator HITL surface. v1 auth: single-tenant Basic auth using
 * OPS_CENTER_AUTH_PASSWORD env var (set in Vercel project settings).
 * Username is fixed to "mikey" — browser shows native login prompt and
 * caches credentials for the session.
 *
 * Future: PR #2c-pre will extend this to also gate write endpoints
 * (POST /api/decision, /api/directive, /api/inbox/*, /api/hitl, etc.)
 * once they exist. Read-only /api/* endpoints stay public for now —
 * info-leak is acceptable; destructive endpoints are not.
 */

export const config = {
  matcher: ["/ops-center-v2", "/ops-center-v2/:path*"],
};

const REALM = "ACMI Control Pad";
const USER = "mikey";

function unauthorized(message = "Authentication required") {
  return new Response(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export default function middleware(req) {
  const expectedPassword = process.env.OPS_CENTER_AUTH_PASSWORD;

  // Fail closed if env var not set — explicit error so Mikey sees + sets it
  if (!expectedPassword) {
    return new Response(
      "ACMI Control Pad auth not configured.\n\nSet OPS_CENTER_AUTH_PASSWORD in Vercel project env vars.\n\nUsername (fixed): mikey",
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      }
    );
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return unauthorized();

  let decoded;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return unauthorized("Malformed credentials");
  }

  const [user, ...passParts] = decoded.split(":");
  const pass = passParts.join(":"); // password may contain colons

  if (user !== USER || pass !== expectedPassword) {
    return unauthorized();
  }

  // Pass through — middleware return undefined / no Response = continue
  return undefined;
}
