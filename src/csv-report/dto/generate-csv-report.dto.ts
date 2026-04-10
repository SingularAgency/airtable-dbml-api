import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateCsvReportDto {
  @ApiProperty({
    description: 'The ID of the completed schema-extraction job.',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @ApiProperty({
    description: 'If true, generates AI-powered business descriptions for each field. Uses the same AI configuration as json-dbml endpoints. Defaults to false.',
    required: false,
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  generateDescriptions?: boolean;
}

