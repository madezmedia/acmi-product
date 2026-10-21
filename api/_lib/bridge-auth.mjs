// Bridge bearer resolution for the fleet ACMI bridge.
//
// The bearer must never be hardcoded in this repository. An earlier revision
// fell back to a literal that was the live production value, so anyone who
// cloned the repo could read and write the fleet datastore. Resolve the
// bearer from the environment only, and refuse to run without one.
//
// The env var names stay as they are so existing deployments keep working.

export const BRIDGE_TOKEN_ENV_NAMES = ["ACMI_BRIDGE_TOKEN", "UPSTASH_REDIS_REST_TOKEN"];

export function bridgeToken(env = process.env) {
  for (const name of BRIDGE_TOKEN_ENV_NAMES) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  throw new Error(
    `Missing bridge token. Set ${BRIDGE_TOKEN_ENV_NAMES.join(" or ")} in the environment.`,
  );
}
