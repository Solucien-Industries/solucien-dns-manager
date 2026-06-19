import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthExchangeGuard } from "./auth-exchange.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Exchange a verified OAuth identity for an API access token (trusted web server only). */
  @Post("login")
  @UseGuards(AuthExchangeGuard)
  @ApiHeader({ name: "X-Auth-Exchange-Secret", required: true })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Return the current authenticated principal. */
  @Get("me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return req.user;
  }
}
