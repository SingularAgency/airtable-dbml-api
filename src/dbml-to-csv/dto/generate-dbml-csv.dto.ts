import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateDbmlCsvDto {
  @ApiProperty({
    description: 'The ID of a completed DBML generation job (from json-dbml or smartsheet-dbml endpoints).',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  jobId: string;
}
