import { Controller, Delete, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { callerFrom as caller } from "../common/request-caller";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Managers see every account in the tenant; members see only themselves. */
  @Get()
  list(@Req() req: Request) {
    return this.users.list(caller(req));
  }

  /** Delete the caller's own account. */
  @Delete("me")
  deleteOwn(@Req() req: Request) {
    return this.users.deleteOwn(caller(req));
  }

  /** Delete another account by id (owners/admins only). */
  @Delete(":id")
  deleteById(@Param("id") id: string, @Req() req: Request) {
    return this.users.deleteById(caller(req), id);
  }
}
