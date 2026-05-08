// OAuth 2.1 authorization endpoint with PKCE.
//
// GET  /api/oauth/authorize?response_type=code&client_id=...&redirect_uri=...
//        &code_challenge=...&code_challenge_method=S256&state=...&scope=mcp
//   → renders consent HTML form (user pastes Upstash URL + Token to authorize)
// POST /api/oauth/authorize
//   form-encoded — issues auth code, redirects to redirect_uri with ?code=...&state=...
//
// PKCE is REQUIRED. We accept S256 only (per MCP spec). plain is rejected.

import { getClient, saveAuthCode } from "./_lib/storage.mjs";

export const config = { runtime: "nodejs" };

function htmlEscape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function renderConsent({ params, error }) {
  const errorBlock = error ? `<div class="err">${htmlEscape(error)}</div>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ACMI MCP</title>
<style>
:root{--bg:#faf8f3;--ink:#1a1a1a;--accent:#c8553d;--mut:#666;--card:#fff;--bord:#e5e1d6}
*{box-sizing:border-box}
body{margin:0;font-family:Georgia,'Times New Roman',serif;background:var(--bg);color:var(--ink);line-height:1.5;min-height:100vh;display:grid;place-items:center;padding:24px}
.card{max-width:480px;width:100%;background:var(--card);border:1px solid var(--bord);border-radius:6px;padding:32px}
h1{margin:0 0 6px;font-size:24px;font-weight:400;letter-spacing:-.01em}
.sub{color:var(--mut);font-size:14px;margin-bottom:20px}
label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:14px 0 4px}
input[type=text],input[type=password]{width:100%;padding:10px 12px;border:1px solid var(--bord);border-radius:4px;font-family:'SF Mono',Menlo,monospace;font-size:13px;background:#fefdf9}
input:focus{outline:none;border-color:var(--accent)}
.client{padding:12px 14px;background:#f5f1e6;border-radius:4px;margin-bottom:18px;font-size:13px}
.client b{font-weight:600}
button{width:100%;padding:11px;background:var(--ink);color:#faf8f3;border:none;border-radius:4px;font-family:inherit;font-size:14px;cursor:pointer;margin-top:18px}
button:hover{background:var(--accent)}
.deny{background:transparent;color:var(--mut);font-size:12px;margin-top:6px;text-decoration:underline;border:none;cursor:pointer;padding:8px}
.err{padding:10px 12px;background:#fdeae6;border-left:3px solid var(--accent);color:var(--accent);font-size:13px;margin-bottom:14px;border-radius:3px}
.foot{font-size:11px;color:var(--mut);margin-top:18px;border-top:1px solid var(--bord);padding-top:14px}
.scope{display:inline-block;padding:2px 8px;background:#f5f1e6;border-radius:10px;font-size:11px;font-family:monospace;margin-right:4px}
</style>
</head>
<body>
<form class="card" method="POST" action="/api/oauth/authorize" autocomplete="off">
  <h1>Authorize ACMI MCP</h1>
  <div class="sub">Connect your ACMI workspace to this app.</div>
  ${errorBlock}
  <div class="client">
    <b>${htmlEscape(params.client_name || params.client_id)}</b> wants access<br>
    <span class="scope">scope: ${htmlEscape(params.scope || "mcp")}</span>
    <span class="scope">redirect: ${htmlEscape(new URL(params.redirect_uri).host)}</span>
  </div>

  <label for="upstash_url">Upstash REST URL</label>
  <input type="text" id="upstash_url" name="upstash_url" required placeholder="https://your-instance.upstash.io" pattern="https://.+\\.upstash\\.io/?" value="${htmlEscape(params.upstash_url_prefill || "")}">

  <label for="upstash_token">Upstash REST Token</label>
  <input type="password" id="upstash_token" name="upstash_token" required placeholder="Bearer token from Upstash console">

  ${["client_id","redirect_uri","code_challenge","code_challenge_method","state","scope","response_type"].map(k=>`<input type="hidden" name="${k}" value="${htmlEscape(params[k]||"")}">`).join("")}

  <button type="submit" name="action" value="approve">Authorize</button>
  <button type="submit" name="action" value="deny" class="deny">Deny</button>

  <div class="foot">Your Upstash credentials are stored encrypted-at-rest, scoped to this access token, and revoked when the token expires. Revoke any time in your Upstash console.</div>
</form>
</body>
</html>`;
}

function redirectError(res, redirect_uri, error, error_description, state) {
  const u = new URL(redirect_uri);
  u.searchParams.set("error", error);
  if (error_description) u.searchParams.set("error_description", error_description);
  if (state) u.searchParams.set("state", state);
  res.statusCode = 302;
  res.setHeader("Location", u.toString());
  res.end();
}

async function validateAuthRequest(query) {
  const required = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method"];
  for (const k of required) {
    if (!query[k]) return { error: "invalid_request", description: `missing ${k}` };
  }
  if (query.response_type !== "code") return { error: "unsupported_response_type", description: "only 'code' supported" };
  if (query.code_challenge_method !== "S256") return { error: "invalid_request", description: "code_challenge_method must be S256" };

  const client = await getClient(query.client_id);
  if (!client) return { error: "invalid_client", description: "unknown client_id" };
  if (!client.redirect_uris.includes(query.redirect_uri)) {
    return { error: "invalid_redirect_uri", description: "redirect_uri not registered for client" };
  }
  return { client };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const query = Object.fromEntries(url.searchParams);
      const v = await validateAuthRequest(query);
      if (v.error) {
        // pre-redirect_uri-validation errors render directly; post errors redirect.
        if (v.error === "invalid_redirect_uri" || v.error === "invalid_client") {
          return res.status(400).json({ error: v.error, error_description: v.description });
        }
        return redirectError(res, query.redirect_uri, v.error, v.description, query.state);
      }
      const params = { ...query, client_name: v.client.client_name };
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").end(renderConsent({ params }));
      return;
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

    const body = req.body || {};
    const v = await validateAuthRequest(body);
    if (v.error) {
      if (v.error === "invalid_redirect_uri" || v.error === "invalid_client") {
        return res.status(400).json({ error: v.error, error_description: v.description });
      }
      return redirectError(res, body.redirect_uri, v.error, v.description, body.state);
    }

    if (body.action === "deny") {
      return redirectError(res, body.redirect_uri, "access_denied", "user denied consent", body.state);
    }

    const upstash_url = String(body.upstash_url || "").trim();
    const upstash_token = String(body.upstash_token || "").trim();
    if (!upstash_url || !upstash_token) {
      const params = { ...body, client_name: v.client.client_name, upstash_url_prefill: upstash_url };
      res.status(400).setHeader("Content-Type", "text/html; charset=utf-8").end(renderConsent({ params, error: "Both Upstash URL and token are required." }));
      return;
    }

    if (!/^https:\/\/[^\s/]+\.upstash\.io\/?$/.test(upstash_url)) {
      const params = { ...body, client_name: v.client.client_name, upstash_url_prefill: upstash_url };
      res.status(400).setHeader("Content-Type", "text/html; charset=utf-8").end(renderConsent({ params, error: "Upstash URL must look like https://<instance>.upstash.io" }));
      return;
    }

    // Probe creds before issuing code so user gets immediate feedback on bad token.
    try {
      const probe = await fetch(upstash_url.replace(/\/$/, "") + "/", {
        method: "POST",
        headers: { Authorization: `Bearer ${upstash_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
      });
      const j = await probe.json();
      if (j.error || j.result !== "PONG") throw new Error(j.error || "PING did not return PONG");
    } catch (e) {
      const params = { ...body, client_name: v.client.client_name, upstash_url_prefill: upstash_url };
      res.status(400).setHeader("Content-Type", "text/html; charset=utf-8").end(renderConsent({ params, error: `Could not authenticate to Upstash: ${e.message}` }));
      return;
    }

    const code = await saveAuthCode({
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
      code_challenge: body.code_challenge,
      code_challenge_method: body.code_challenge_method,
      scope: body.scope || "mcp",
      upstash_url,
      upstash_token,
      sub: `upstash:${new URL(upstash_url).hostname}`,
    });

    const u = new URL(body.redirect_uri);
    u.searchParams.set("code", code);
    if (body.state) u.searchParams.set("state", body.state);
    res.statusCode = 302;
    res.setHeader("Location", u.toString());
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: "server_error", error_description: e.message });
  }
}
