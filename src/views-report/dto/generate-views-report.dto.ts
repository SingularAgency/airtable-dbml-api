import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class GenerateViewsReportDto {
  @ApiProperty({
    description: 'The ID of the completed schema-extraction job.',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @ApiProperty({
    description: 'The Airtable Base ID (not used, kept for API compatibility).',
    example: 'appXXXXXXXXXXXXXX',
    required: false,
  })
  @IsString()
  @IsOptional()
  baseId?: string;

  @ApiProperty({
    description: 'The Airtable Personal Access Token (not used, kept for API compatibility).',
    example: 'patXXXXXXXXXXXXXX',
    required: false,
  })
  @IsString()
  @IsOptional()
  accessToken?: string;
}
