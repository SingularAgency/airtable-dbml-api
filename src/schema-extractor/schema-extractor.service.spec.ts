import { Test, TestingModule } from '@nestjs/testing';
import { SchemaExtractorService } from './schema-extractor.service';

describe('SchemaExtractorService', () => {
  let service: SchemaExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaExtractorService],
    }).compile();

    service = module.get<SchemaExtractorService>(SchemaExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
