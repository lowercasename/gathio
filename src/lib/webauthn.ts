import { getConfig } from "./config.js";

export interface WebAuthnParams {
  rpID: string;
  nickName: string;
  allowedOrigins: string[];
}

/**
 * Derive the WebAuthn Relying Party parameters from the configured domain.
 *
 * WebAuthn's rpID is the bare host (no scheme, no port). The expected origin
 * includes the scheme and port. Origin registration must match exactly what the
 * browser uses, so localhost (where the app commonly runs on :3000) is treated
 * as http while production domains are https.
 */
export const getWebAuthnParams = (): WebAuthnParams => {
  const config = getConfig();
  const rawDomain = config.general.domain; // e.g. "gath.io" or "localhost:3000"
  const host = rawDomain.split(":")[0];
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  const scheme = isLocalhost ? "http" : "https";
  return {
    rpID: host,
    nickName: config.general.site_name || "Gathio",
    allowedOrigins: [`${scheme}://${rawDomain}`],
  };
};

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
