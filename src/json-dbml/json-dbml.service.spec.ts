import { Test, TestingModule } from '@nestjs/testing';
import { JsonDbmlService } from './json-dbml.service';

describe('JsonDbmlService', () => {
  let service: JsonDbmlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JsonDbmlService],
    }).compile();

    service = module.get<JsonDbmlService>(JsonDbmlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
