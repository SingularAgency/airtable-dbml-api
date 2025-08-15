import { Test, TestingModule } from '@nestjs/testing';
import { AirtableDocsController } from './airtable-docs.controller';

describe('AirtableDocsController', () => {
  let controller: AirtableDocsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AirtableDocsController],
    }).compile();

    controller = module.get<AirtableDocsController>(AirtableDocsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
