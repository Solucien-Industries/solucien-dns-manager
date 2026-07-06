import { Injectable, Logger } from "@nestjs/common";
import geoip from "geoip-lite";
import { isPrivateIp, normaliseIp } from "./client-ip";

export type GeoLocation = {
  country: string | null; // ISO-3166 alpha-2, uppercased
  region: string | null;
  city: string | null;
};

/**
 * Offline IP geolocation via the bundled geoip-lite (MaxMind GeoLite2) database.
 * Fully local — no network calls, no API key. Wrapped as a provider so it can be
 * swapped for a hosted lookup or a shipped .mmdb later without touching callers.
 */
@Injectable()
export class GeoIpService {
  private readonly logger = new Logger(GeoIpService.name);

  /** Returns null for private/loopback IPs and when the address can't be located. */
  lookup(ip: string | null | undefined): GeoLocation | null {
    const norm = normaliseIp(ip);
    if (!norm || isPrivateIp(norm)) return null;

    try {
      const hit = geoip.lookup(norm);
      if (!hit) return null;
      return {
        country: hit.country ? hit.country.toUpperCase() : null,
        region: hit.region || null,
        city: hit.city || null,
      };
    } catch (err) {
      this.logger.warn(`GeoIP lookup failed for ${norm}: ${(err as Error).message}`);
      return null;
    }
  }
}
