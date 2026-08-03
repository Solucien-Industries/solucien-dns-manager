import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { ApprovedLocationsController } from "./approved-locations.controller";
import { LocationService } from "./location.service";
import { JwtOrApiKeyGuard } from "./jwt-or-api-key.guard";

@Module({
  imports: [NotificationsModule],
  controllers: [ApiKeysController, ApprovedLocationsController],
  providers: [ApiKeysService, LocationService, JwtOrApiKeyGuard],
  exports: [ApiKeysService, LocationService, JwtOrApiKeyGuard],
})
export class ApiKeysModule {}
