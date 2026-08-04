import type { Request } from "express";

/**
 * Best-effort extraction of the originating client IP.
 *
 * Relies on Express `trust proxy` being configured (see main.ts) so `req.ip`
 * already reflects the left-most X-Forwarded-For entry behind trusted proxies.
 * Falls back to the raw header / socket address, and normalises the IPv6-mapped
 * IPv4 form (`::ffff:1.2.3.4`) that geoip lookups don't understand.
 */
export function clientIp(req: Request): string | null {
  const fromReq = req.ip;
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedFirst = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0]?.trim();

  const raw = fromReq || forwardedFirst || req.socket?.remoteAddress || null;
  return normaliseIp(raw);
}

/** Strip the IPv6-mapped IPv4 prefix so downstream geo/CIDR checks get a clean address. */
export function normaliseIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

/** True for loopback / RFC1918 / link-local addresses (skip geolocation for these). */
export function isPrivateIp(ip: string | null | undefined): boolean {
  const norm = normaliseIp(ip);
  if (!norm) return true;
  if (norm === "::1" || norm === "0.0.0.0") return true;
  if (norm.toLowerCase().startsWith("fe80:") || norm.toLowerCase().startsWith("fc") || norm.toLowerCase().startsWith("fd")) {
    return true;
  }
  return PRIVATE_V4.some((re) => re.test(norm));
}
