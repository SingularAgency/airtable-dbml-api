import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { ThrottleService } from './throttle.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [GeminiService, ThrottleService],
  exports: [GeminiService],
})
export class GeminiModule {}