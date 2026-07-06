import { Global, Module } from "@nestjs/common";
import { GeoIpService } from "./geoip.service";

/** Cross-cutting utilities available everywhere without re-importing. */
@Global()
@Module({
  providers: [GeoIpService],
  exports: [GeoIpService],
})
export class CommonModule {}
