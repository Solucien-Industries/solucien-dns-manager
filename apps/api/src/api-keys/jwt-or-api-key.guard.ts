import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { clientIp } from "../common/client-ip";
import { ApiKeysService } from "./api-keys.service";
import { LocationService } from "./location.service";

const KEY_PREFIX = "sdm_";

/**
 * Accepts EITHER a user JWT (web app) OR a programmatic API key (automation) on
 * the Authorization: Bearer header, discriminated by the fixed `sdm_` key
 * prefix. For API-key requests it validates the key, attaches the owning
 * tenant/user to req.user, and runs the location check (notify-only — a
 * mis-located call is recorded and alerted but not blocked).
 */
@Injectable()
export class JwtOrApiKeyGuard extends AuthGuard("jwt") {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly locations: LocationService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers["authorization"];
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (token?.startsWith(KEY_PREFIX)) {
      const result = await this.apiKeys.validateSecret(token);
      if (!result) throw new UnauthorizedException("Invalid API key.");

      req.user = {
        userId: result.userId,
        tenantId: result.tenantId,
        role: "MEMBER",
        keyId: result.keyId,
        authType: "apikey",
      } as Request["user"];

      const ip = clientIp(req);
      // Non-blocking: enforcement is notify-only, so failures never deny access.
      await this.locations
        .check({ tenantId: result.tenantId, keyId: result.keyId, ip, path: req.originalUrl.split("?")[0] })
        .catch(() => undefined);
      return true;
    }

    // Fall through to the standard JWT strategy.
    return super.canActivate(context) as Promise<boolean>;
  }
}
