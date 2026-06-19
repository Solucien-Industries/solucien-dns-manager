import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

const DEV_EXCHANGE_SECRET = "dev-exchange-secret-local-only";

function resolveExchangeSecret(): string {
  return process.env.AUTH_EXCHANGE_SECRET ?? DEV_EXCHANGE_SECRET;
}

/**
 * Restricts POST /auth/login to the trusted Next.js server.
 * The browser never calls login directly; it uses /api/auth/token instead.
 */
@Injectable()
export class AuthExchangeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers["x-auth-exchange-secret"];
    const expected = resolveExchangeSecret();

    if (typeof provided !== "string" || provided !== expected) {
      throw new ForbiddenException("Invalid auth exchange secret.");
    }

    return true;
  }
}
