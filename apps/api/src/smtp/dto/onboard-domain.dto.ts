import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength } from "class-validator";

export class OnboardDomainDto {
  @ApiProperty({ example: "mail.customer.com", description: "The customer domain to verify for sending." })
  @IsString()
  @MaxLength(253)
  @Matches(/^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})+$/, {
    message: "domain must be a valid fully-qualified domain name",
  })
  domain!: string;
}
