import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

/**
 * Gate for the platform admin console. Compose AFTER JwtAuthGuard
 * (`@UseGuards(JwtAuthGuard, AdminGuard)`) so req.user is already populated.
 * Only ADMIN principals may pass — OWNER is a tenant-scoped role (see
 * ManagerGuard) and must not see or act on other tenants' data.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const role = (req.user as { role?: string } | undefined)?.role;
    if (role === "ADMIN") return true;
    throw new ForbiddenException("Platform administrator access required.");
  }
}
