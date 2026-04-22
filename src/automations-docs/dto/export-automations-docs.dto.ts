import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExportAutomationsDocsDto {
  @ApiProperty({
    description: 'Airtable Base ID (application id)',
    example: 'appXXXXXXXXXXXXXX',
  })
  @IsNotEmpty()
  @IsString()
  baseId: string;

  @ApiProperty({
    description:
      'Personal Access Token (PAT) starting with "pat". Must include scope **automations:read** and this base as a token resource. See Airtable PAT and scopes documentation.',
    example: 'patqMgZFR4QA65YVZ.XXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsNotEmpty()
  @IsString()
  accessToken: string;
}
