export interface AirtableConfig {
  baseId: string;
  accessToken: string;
  forceUpdate?: boolean;
  protectedTables?: string[];
  convertToSnakeCase?: boolean;
}
