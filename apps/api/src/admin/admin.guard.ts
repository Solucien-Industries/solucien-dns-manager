import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

/**
 * Gate for the platform admin console. Compose AFTER JwtAuthGuard
 * (`@UseGuards(JwtAuthGuard, AdminGuard)`) so req.user is already populated.
 * Only OWNER/ADMIN principals may pass.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const role = (req.user as { role?: string } | undefined)?.role;
    if (role === "OWNER" || role === "ADMIN") return true;
    throw new ForbiddenException("Platform administrator access required.");
  }
}
