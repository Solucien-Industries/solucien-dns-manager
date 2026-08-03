import type { Request } from "express";
import type { Caller } from "../users/users.service";

/** Normalise req.user (set by JwtAuthGuard / ApiKeyGuard) into a Caller. */
export function callerFrom(req: Request): Caller {
  const user = req.user as Partial<Caller> | undefined;
  return {
    userId: user?.userId ?? "ephemeral",
    email: user?.email ?? "unknown@local",
    tenantId: user?.tenantId ?? "ephemeral-tenant",
    role: user?.role ?? "MEMBER",
  };
}
