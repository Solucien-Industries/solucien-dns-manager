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
    // registerAsync + useFactory so the secret is read AFTER ConfigModule has
    // loaded .env. With the plain register({ secret: process.env.JWT_SECRET })
    // the value was read at import time (before .env loaded), so tokens were
    // signed with the fallback secret but validated with the real one -> 401.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",
        // Cast: env vars are plain strings; @nestjs/jwt expects the `ms` template type.
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as `${number}d` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthExchangeGuard, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}