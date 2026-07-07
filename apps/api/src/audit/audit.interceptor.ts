import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { clientIp } from "../common/client-ip";
import { AuditService } from "./audit.service";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// High-volume / low-signal routes we never audit.
const SKIP_PATHS = [/^\/api\/health/, /^\/api\/metrics/, /^\/api\/monitoring/, /^\/api\/docs/];

/**
 * Records authenticated API activity ("what users did after logging in").
 *
 * Runs after guards, so req.user is populated. To control volume it logs only
 * mutations (POST/PUT/PATCH/DELETE) plus any failed request (status >= 400),
 * and skips successful reads and noisy health/metrics routes. Writes are
 * fire-and-forget so auditing never adds latency or fails a request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    const finish = (statusCode: number) => {
      const method = req.method.toUpperCase();
      const path = routeTemplate(req);
      if (this.shouldSkip(method, path, statusCode)) return;

      const user = req.user as { userId?: string; tenantId?: string } | undefined;
      void this.audit.record({
        userId: user?.userId ?? null,
        tenantId: user?.tenantId ?? null,
        method,
        path,
        statusCode,
        ip: clientIp(req),
        durationMs: Date.now() - startedAt,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => finish(res.statusCode),
        // On thrown errors the response status may not be set yet; fall back to
        // the exception status when available, else 500.
        error: (err: { status?: number }) => finish(err?.status ?? 500),
      }),
    );
  }

  private shouldSkip(method: string, path: string, statusCode: number): boolean {
    if (SKIP_PATHS.some((re) => re.test(path))) return true;
    const isError = statusCode >= 400;
    const isMutation = MUTATING_METHODS.has(method);
    return !isMutation && !isError;
  }
}

/** Prefer the low-cardinality route template (e.g. /api/users/:id) over raw URLs. */
function routeTemplate(req: Request): string {
  const base = (req as { baseUrl?: string }).baseUrl ?? "";
  const routePath = (req.route as { path?: string } | undefined)?.path;
  if (routePath) return `${base}${routePath}` || routePath;
  return req.originalUrl.split("?")[0];
}
