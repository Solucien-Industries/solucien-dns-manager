import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminController } from "./admin.controller";
import { AdminInvitesService } from "./admin-invites.service";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [AdminController],
  providers: [ModerationService, AdminInvitesService],
})
export class AdminModule {}
