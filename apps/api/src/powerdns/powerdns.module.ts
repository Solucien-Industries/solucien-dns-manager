import { Global, Module } from "@nestjs/common";
import { PowerDnsService } from "./powerdns.service";

@Global()
@Module({
  providers: [PowerDnsService],
  exports: [PowerDnsService],
})
export class PowerDnsModule {}
