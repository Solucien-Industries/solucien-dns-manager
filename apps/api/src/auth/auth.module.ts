import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthExchangeGuard } from "./auth-exchange.guard";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",
      // Cast: env vars are plain strings; @nestjs/jwt expects the `ms` template type.
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as `${number}d` },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthExchangeGuard, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
