import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExtractSchemaDto {
  @ApiProperty({
    description: 'Airtable Base ID',
    example: 'appXXXXXXXXXXXXXX',
  })
  @IsNotEmpty()
  @IsString()
  baseId: string;

  @ApiProperty({
    description: 'Airtable Personal Access Token (starting with "pat")',
    example: 'patqMgZFR4QA65YVZ.XXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsNotEmpty()
  @IsString()
  accessToken: string;
}
