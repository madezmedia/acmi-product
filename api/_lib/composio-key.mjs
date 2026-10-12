// Composio API key resolution. No key literals live in this repo.
// Order: Infisical (once per cold start, cached) -> process.env.COMPOSIO_API_KEY -> clear error.
// Infisical location is configurable:
//   COMPOSIO_KEY_INFISICAL_PATH (default "/acmi-product"), COMPOSIO_KEY_INFISICAL_ENV (default "prod"),
//   COMPOSIO_KEY_INFISICAL_NAME (default "COMPOSIO_API_KEY").

let cached = null;    // resolved key string
let inflight = null;  // shared promise during the cold-start fetch

export class ComposioKeyMissingError extends Error {
  constructor() {
    super('Composio API key unavailable: not found in Infisical and COMPOSIO_API_KEY env is not set.');
    this.name = 'ComposioKeyMissingError';
  }
}

async function fromInfisical() {
  const api = (process.env.INFISICAL_API || '').replace(/\/+$/, '');
  const clientId = process.env.INFISICAL_FLEET_CLIENT_ID || '';
  const clientSecret = process.env.INFISICAL_FLEET_CLIENT_SECRET || '';
  const workspaceId = process.env.INFISICAL_PROJECT_ID || '';
  if (!api || !clientId || !clientSecret || !workspaceId) return null;

  const login = await fetch(`${api}/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!login.ok) throw new Error(`infisical login ${login.status}`);
  const { accessToken } = await login.json();
  if (!accessToken) throw new Error('infisical login missing accessToken');

  const name = process.env.COMPOSIO_KEY_INFISICAL_NAME || 'COMPOSIO_API_KEY';
  const qs = new URLSearchParams({
    workspaceId,
    environment: process.env.COMPOSIO_KEY_INFISICAL_ENV || 'prod',
    secretPath: process.env.COMPOSIO_KEY_INFISICAL_PATH || '/acmi-product',
  });
  const r = await fetch(`${api}/v3/secrets/raw/${encodeURIComponent(name)}?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`infisical secret fetch ${r.status}`);
  const d = await r.json();
  return d?.secret?.secretValue || null;
}

async function resolve() {
  let key = null;
  try {
    key = await fromInfisical();
  } catch (e) {
    // Never log the value; only the failure reason.
    console.warn('[composio-key] Infisical lookup failed, falling back to env:', e?.message || e);
  }
  if (!key) key = (typeof process !== 'undefined' && process.env.COMPOSIO_API_KEY) || null;
  if (!key) throw new ComposioKeyMissingError();
  return key;
}

export async function getComposioKey() {
  if (cached) return cached;
  if (!inflight) {
    inflight = resolve().then((k) => { cached = k; return k; }).finally(() => { inflight = null; });
  }
  return inflight;
}

// Kick off the fetch at module load (cold start); swallow here, callers get the error.
getComposioKey().catch(() => {});

// Test helper.
export function _resetComposioKeyCache() { cached = null; inflight = null; }
