import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class AirtableDocsFileDto {
  @ApiProperty({
    description: 'API Key for Airtable',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  apiKey: string;

  @ApiProperty({
    description: 'Base ID of the Airtable base', 
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  baseId: string;

  @ApiProperty({
    description: 'Whether to force update existing descriptions',
    type: 'boolean',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;
}
