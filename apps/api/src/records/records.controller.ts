import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RecordsService } from "./records.service";
import { CreateRecordDto } from "./dto/create-record.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("records")
@Controller("records")
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @ApiQuery({ name: "domain", required: false })
  findAll(@Query("domain") domain?: string) {
    return this.records.findAll(domain);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateRecordDto) {
    return this.records.create(dto);
  }
}
