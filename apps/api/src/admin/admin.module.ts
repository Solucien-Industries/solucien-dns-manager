import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminController } from "./admin.controller";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [AdminController],
  providers: [ModerationService],
})
export class AdminModule {}
