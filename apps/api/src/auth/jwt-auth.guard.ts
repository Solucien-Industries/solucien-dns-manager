import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Apply with @UseGuards(JwtAuthGuard) to require a valid bearer token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
