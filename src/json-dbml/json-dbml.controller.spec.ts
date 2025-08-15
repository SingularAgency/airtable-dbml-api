import { Test, TestingModule } from '@nestjs/testing';
import { JsonDbmlController } from './json-dbml.controller';

describe('JsonDbmlController', () => {
  let controller: JsonDbmlController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JsonDbmlController],
    }).compile();

    controller = module.get<JsonDbmlController>(JsonDbmlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
