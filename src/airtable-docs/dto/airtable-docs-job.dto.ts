import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class AirtableDocsJobDto {
  @ApiProperty({
    description: 'API Key for Airtable',
    example: 'key123xyz',
  })
  @IsNotEmpty()
  @IsString()
  apiKey: string;

  @ApiProperty({
    description: 'Base ID of the Airtable base',
    example: 'app123xyz',
  })
  @IsNotEmpty()
  @IsString()
  baseId: string;

  @ApiProperty({
    description: 'Job ID from a previous DBML generation job',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty()
  @IsString()
  dbmlJobId: string;

  @ApiProperty({
    description: 'Whether to force update existing descriptions',
    example: false,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;
}
