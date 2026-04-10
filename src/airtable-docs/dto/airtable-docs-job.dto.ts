import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class AirtableDocsJobDto {
  @ApiProperty({
    description: 'Base ID of the Airtable base',
    example: 'appXXXXXXXXXXXXXX',
  })
  @IsNotEmpty()
  @IsString()
  baseId: string;

  @ApiProperty({
    description: 'Access Token for Airtable',
    example: 'pat.XXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsNotEmpty()
  @IsString()
  accessToken: string;

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

  @ApiProperty({
    description: 'Array of table names to protect from force update (will not be overwritten even if forceUpdate is true)',
    example: ['Users', 'Products', 'Orders'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  protectedTables?: string[];

  @ApiProperty({
    description: 'Whether to convert field names to snake_case',
    example: false,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  convertToSnakeCase?: boolean;
}
