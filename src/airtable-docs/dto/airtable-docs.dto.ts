import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class AirtableDocsDto {
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

  @ApiProperty({
    description: 'Array of table names to protect from force update (will not be overwritten even if forceUpdate is true)',
    example: ['Users', 'Products', 'Orders'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  protectedTables?: string[];
}
