import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthController } from "./auth.controller";
import { AuthExchangeGuard } from "./auth-exchange.guard";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    NotificationsModule,
    // registerAsync so JWT secret is read after ConfigModule loads .env
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as `${number}d` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthExchangeGuard, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
