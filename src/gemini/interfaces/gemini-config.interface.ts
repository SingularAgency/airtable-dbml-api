export interface GeminiConfig {
    model?: string;
    overwriteFieldDescriptions?: boolean;
    overwriteTableDescriptions?: boolean;
  }
  
  export const DEFAULT_GEMINI_MODEL = 'gpt-4o-mini';