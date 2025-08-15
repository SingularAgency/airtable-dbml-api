import { Test, TestingModule } from '@nestjs/testing';
import { SchemaExtractorController } from './schema-extractor.controller';

describe('SchemaExtractorController', () => {
  let controller: SchemaExtractorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchemaExtractorController],
    }).compile();

    controller = module.get<SchemaExtractorController>(SchemaExtractorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
