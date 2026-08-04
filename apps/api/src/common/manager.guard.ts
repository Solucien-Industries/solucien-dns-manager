import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

/**
 * Allows tenant managers (OWNER/ADMIN) through. Compose after JwtAuthGuard.
 * Use for tenant-scoped management (e.g. approved-location rules) as distinct
 * from the platform AdminGuard on the cross-tenant admin console.
 */
@Injectable()
export class ManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const role = (req.user as { role?: string } | undefined)?.role;
    if (role === "OWNER" || role === "ADMIN") return true;
    throw new ForbiddenException("Tenant manager access required.");
  }
}
