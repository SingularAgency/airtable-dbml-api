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
   * Infer human-readable English labels for all Airtable `workflowActionTypeId` and
   * `workflowTriggerTypeId` values using OpenAI. Calls are **batched**; each batch
   * uses {@link ThrottleService.throttle} before the request (same pattern as DBML / Gemini flows).
   */
  async inferAirtableAutomationLabelsBatched(
    actionTypeIds: string[],
    triggerTypeIds: string[],
    modelName: string = DEFAULT_GEMINI_MODEL,
  ): Promise<{ actions: Record<string, string>; triggers: Record<string, string> }> {
    const uniqueActions = [
      ...new Set(
        (actionTypeIds || []).filter((x) => typeof x === 'string' && x.length > 0),
      ),
    ];
    const uniqueTriggers = [
      ...new Set(
        (triggerTypeIds || []).filter((x) => typeof x === 'string' && x.length > 0),
      ),
    ];
    const outActions: Record<string, string> = {};
    const outTriggers: Record<string, string> = {};
    const CHUNK = 20;

    for (let i = 0; i < uniqueActions.length; i += CHUNK) {
      const chunk = uniqueActions.slice(i, i + CHUNK);
      const part = await this.inferAirtableAutomationLabelChunk(
        chunk,
        [],
        modelName,
      );
      Object.assign(outActions, part.actions);
    }
    for (let i = 0; i < uniqueTriggers.length; i += CHUNK) {
      const chunk = uniqueTriggers.slice(i, i + CHUNK);
      const part = await this.inferAirtableAutomationLabelChunk(
        [],
        chunk,
        modelName,
      );
      Object.assign(outTriggers, part.triggers);
    }

    return { actions: outActions, triggers: outTriggers };
  }

  private async inferAirtableAutomationLabelChunk(
    actionIds: string[],
    triggerIds: string[],
    modelName: string,
  ): Promise<{ actions: Record<string, string>; triggers: Record<string, string> }> {
    if (actionIds.length === 0 && triggerIds.length === 0) {
      return { actions: {}, triggers: {} };
    }
    try {
      await this.throttleService.throttle();
      const prompt = `You document Airtable automations. The API only exposes opaque internal ids for action types and trigger types.

For EVERY id in the lists below, assign a short, clear English label (2–8 words) that a builder would understand. Examples of style: "When a record is created", "When a record matches conditions", "Run a script", "AI: generate content", "Slack: send message", "Delay", "Gmail: send email". If an id looks like a random hash, infer the most likely product area (e.g. marketplace app, email, schedule) or use "App or integration block" / "Custom trigger" if completely opaque.

actionTypeIds (workflowActionTypeId) — may be empty:
${JSON.stringify(actionIds)}

triggerTypeIds (workflowTriggerTypeId) — may be empty:
${JSON.stringify(triggerIds)}

Return a single JSON object ONLY (no markdown) with this exact structure. Every id from the input must appear as a key in the matching object. Use the id string exactly as the key.
{"actions":{"<id>":"<label>",...},"triggers":{"<id>":"<label>",...}}`;

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
      const parsed = this.parseAirtableLabelJsonFromLlm(text);
      if (!parsed) {
        this.logger.warn('Could not parse automation label JSON from LLM response');
        return { actions: {}, triggers: {} };
      }
      return {
        actions: this.sanitizeIdLabelMap(parsed.actions),
        triggers: this.sanitizeIdLabelMap(parsed.triggers),
      };
    } catch (error: any) {
      if (this.isQuotaExceededError(error)) {
        const retryDelay = this.extractRetryDelay(error) || 45;
        this.throttleService.notifyQuotaExceeded(retryDelay);
        this.logger.warn(
          `Quota or rate limit when inferring automation labels: ${error?.message}`,
        );
      } else {
        this.logger.error(
          'Error inferring Airtable automation labels:',
          error?.message,
        );
      }
      return { actions: {}, triggers: {} };
    }
  }

  private parseAirtableLabelJsonFromLlm(text: string): {
    actions: Record<string, string>;
    triggers: Record<string, string>;
  } | null {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fence ? fence[1]!.trim() : trimmed;
    try {
      const data = JSON.parse(jsonStr) as {
        actions?: unknown;
        triggers?: unknown;
      };
      return {
        actions: typeof data.actions === 'object' && data.actions !== null
          ? (data.actions as Record<string, string>)
          : {},
        triggers:
          typeof data.triggers === 'object' && data.triggers !== null
            ? (data.triggers as Record<string, string>)
            : {},
      };
    } catch {
      return null;
    }
  }

  private sanitizeIdLabelMap(
    m: Record<string, string> | undefined,
  ): Record<string, string> {
    if (!m || typeof m !== 'object') {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        out[k] = v.trim();
      }
    }
    return out;
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