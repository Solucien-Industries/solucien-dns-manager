import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RecordsService } from "./records.service";
import { CreateRecordDto } from "./dto/create-record.dto";
import { JwtOrApiKeyGuard } from "../api-keys/jwt-or-api-key.guard";

@ApiTags("records")
@Controller("records")
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @ApiQuery({ name: "domain", required: false })
  findAll(@Query("domain") domain?: string) {
    return this.records.findAll(domain);
  }

  // Accepts a user JWT or a programmatic API key; key usage is location-checked.
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  create(@Body() dto: CreateRecordDto) {
    return this.records.create(dto);
  }
}
