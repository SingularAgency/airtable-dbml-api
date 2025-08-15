import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class AirtableDocsDto {
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
    description: 'Path to the DBML file to use as source for documentation',
    example: '/path/to/output.dbml',
  })
  @IsNotEmpty()
  @IsString()
  dbmlFilePath: string;

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
