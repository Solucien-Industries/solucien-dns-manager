import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: Request) {
    const user = req.user as { userId?: string };
    return this.notifications.listForUser(user.userId ?? "ephemeral");
  }

  @Post(":id/read")
  markRead(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as { userId?: string };
    return this.notifications.markRead(id, user.userId ?? "ephemeral");
  }
}
