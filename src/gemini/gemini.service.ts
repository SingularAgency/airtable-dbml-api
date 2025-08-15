import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GeminiConfig, DEFAULT_GEMINI_MODEL } from './interfaces/gemini-config.interface';
import { ConfigService } from '@nestjs/config';
import { ThrottleService } from './throttle.service';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private throttleService: ThrottleService
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async generateBusinessDescription(
    fieldOrTableName: string, 
    modelName: string = DEFAULT_GEMINI_MODEL,
    isTable: boolean = false
  ): Promise<string> {
    try {
      // Apply throttling before making the API call
      await this.throttleService.throttle();
      
      let prompt = isTable
        ? `Given the database table name "${fieldOrTableName}", provide a clear and concise business description of what this table represents and its purpose in a business context. Focus on its role and the type of data it stores. Keep the description under 200 characters.`
        : `Given the database field name "${fieldOrTableName}", provide a clear and concise business description of what this field represents in a business context. Focus on its purpose and the type of data it stores. Keep the description under 100 characters.`;

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 150,
      });

      const response = completion.choices?.[0]?.message?.content?.trim();
      return response || 'No description available.';
    } catch (error) {
      // Detect quota errors specifically
      if (this.isQuotaExceededError(error)) {
        // Extract suggested retry time if available
        const retryDelay = this.extractRetryDelay(error) || 45;
        this.throttleService.notifyQuotaExceeded(retryDelay);
        
        this.logger.warn(`Quota exceeded when generating description for "${fieldOrTableName}". Will retry after ${retryDelay}s.`);
        
        // Return a default value to not block the flow
        return isTable
          ? `Table storing ${fieldOrTableName.replace(/_/g, ' ')} data.`
          : `${fieldOrTableName.replace(/_/g, ' ')} information.`;
      }
      
      this.logger.error(`Error generating description for "${fieldOrTableName}":`, error.message);
      return isTable
        ? 'No business description available.'
        : 'No field description available.';
    }
  }

  async generateContentWithPrompt(prompt: string, modelName: string = 'gpt-4o-mini'): Promise<string> {
    try {
      // Apply throttling before making the API call
      await this.throttleService.throttle();
      
      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
      });

      const response = completion.choices?.[0]?.message?.content?.trim();
      return response || 'Generated description not available.';
    } catch (error) {
      // Detect quota errors
      if (this.isQuotaExceededError(error)) {
        const retryDelay = this.extractRetryDelay(error) || 45;
        this.throttleService.notifyQuotaExceeded(retryDelay);
        
        this.logger.warn(`Quota exceeded when generating content with prompt. Will retry after ${retryDelay}s.`);
        
        // Return a generic value to not block the process
        return 'Generated description not available due to API limitations.';
      }
      
      this.logger.error('Error generating content with prompt:', error.message);
      return 'No description available.';
    }
  }

  async generateBusinessDescriptionWithRetry(
    fieldOrTableName: string,
    modelName: string = DEFAULT_GEMINI_MODEL,
    isTable: boolean = false,
    maxRetries: number = 5
  ): Promise<string> {
    let retryCount = 0;
    let lastError;

    while (retryCount < maxRetries) {
      try {
        // Apply throttling before making the API call
        await this.throttleService.throttle();
        
        let prompt = isTable
          ? `Given the database table name "${fieldOrTableName}", provide a clear and concise business description of what this table represents and its purpose in a business context. Focus on its role and the type of data it stores. Keep the description under 200 characters.`
          : `Given the database field name "${fieldOrTableName}", provide a clear and concise business description of what this field represents in a business context. Focus on its purpose and the type of data it stores. Keep the description under 100 characters.`;

        const completion = await this.openai.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 150,
        });

        const response = completion.choices?.[0]?.message?.content?.trim();
        return response || 'No description available.';
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error
        const isRateLimit = 
          error.message?.includes('rate limit') || 
          error.message?.includes('quota exceeded') ||
          error.message?.includes('resource exhausted') ||
          error.status === 429;
          
        if (isRateLimit) {
          // Calculate wait time with exponential backoff
          // Base: 1s, 2s, 4s, 8s, 16s...
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 30000);
          
          // Add some randomness (jitter) to avoid synchronization
          const jitter = Math.random() * 1000;
          const waitTime = backoffTime + jitter;
          
          console.log(`Rate limit hit for "${fieldOrTableName}". Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
        } else {
          // If it's not a rate limit error, throw the error
          throw error;
        }
      }
    }
    
    // If all retries fail, return a default value and log the error
    console.error(`Failed to generate description for "${fieldOrTableName}" after ${maxRetries} retries:`, lastError);
    return isTable
      ? 'No business description available due to API limitations.'
      : 'No description available due to API limitations.';
  }

  async generateContentWithPromptWithRetry(
    prompt: string, 
    modelName: string = 'gpt-4o-mini',
    maxRetries: number = 5
  ): Promise<string> {
    let retryCount = 0;
    let lastError;

    while (retryCount < maxRetries) {
      try {
        // Apply throttling before making the API call
        await this.throttleService.throttle();
        
        const completion = await this.openai.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 200,
        });

        const response = completion.choices?.[0]?.message?.content?.trim();
        return response || 'No description available.';
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error
        const isRateLimit = 
          error.message?.includes('rate limit') || 
          error.message?.includes('quota exceeded') ||
          error.message?.includes('resource exhausted') ||
          error.status === 429;
          
        if (isRateLimit) {
          // Calculate wait time with exponential backoff
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 30000);
          const jitter = Math.random() * 1000;
          const waitTime = backoffTime + jitter;
          
          console.log(`Rate limit hit. Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    console.error(`Failed to generate content after ${maxRetries} retries:`, lastError);
    return 'No description available due to API limitations.';
  }

  /**
   * Determines if an error is due to exceeding quota
   */
  private isQuotaExceededError(error: any): boolean {
    return error.message?.includes('quota') || 
           error.message?.includes('429') ||
           error.message?.includes('Too Many Requests') ||
           error.status === 429;
  }

  /**
   * Extracts the recommended retry time from the error message
   */
  private extractRetryDelay(error: any): number | null {
    try {
      // Try to extract "retryDelay":"45s" or similar
      const retryMatch = error.message.match(/retryDelay["']?:\s*["']?(\d+)s/);
      if (retryMatch && retryMatch[1]) {
        return parseInt(retryMatch[1], 10);
      }
    } catch (e) {
      // Ignore extraction errors
    }
    return null;
  }
}