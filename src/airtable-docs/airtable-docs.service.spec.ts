import { Test, TestingModule } from '@nestjs/testing';
import { AirtableDocsService } from './airtable-docs.service';

describe('AirtableDocsService', () => {
  let service: AirtableDocsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AirtableDocsService],
    }).compile();

    service = module.get<AirtableDocsService>(AirtableDocsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
