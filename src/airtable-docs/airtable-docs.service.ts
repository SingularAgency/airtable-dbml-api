import { Injectable, Logger } from '@nestjs/common';
import { AirtableConfig } from './interfaces/airtable-config.interface';
import * as fs from 'fs';
import * as path from 'path';
import { JobService } from '../job/job.service';
import axios from 'axios';

@Injectable()
export class AirtableDocsService {
  private readonly logger = new Logger(AirtableDocsService.name);

  constructor(private readonly jobService: JobService) {}

  /**
   * Procesa un archivo DBML y actualiza las descripciones en Airtable
   */
  async processDbmlAndUpdateAirtable(
    airtableConfig: AirtableConfig,
    dbmlFilePath: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    try {
      // Validar que el archivo exista
      if (!fs.existsSync(dbmlFilePath)) {
        throw new Error(`DBML file not found at path: ${dbmlFilePath}`);
      }

      // Leer el contenido del archivo DBML
      const dbmlContent = fs.readFileSync(dbmlFilePath, 'utf-8');
      
      // Extraer tablas del DBML usando regex
      const tablePattern = /Table\s+(\w+)\s*{([^}]+)}/g;
      const tables = [];
      let match;
      
      while ((match = tablePattern.exec(dbmlContent)) !== null) {
        tables.push({
          name: match[1],
          content: match[2],
        });
      }

      if (tables.length === 0) {
        throw new Error('No tables found in DBML file');
      }

      updateProgress(5, `Found ${tables.length} tables to process`);

      // Obtener información de todas las tablas de Airtable
      const allTablesUrl = `https://api.airtable.com/v0/meta/bases/${airtableConfig.baseId}/tables`;
      const headers = {
        Authorization: `Bearer ${airtableConfig.accessToken}`,
        'Content-Type': 'application/json',
      };

      const airtableTablesResponse = await axios.get(allTablesUrl, { headers });
      const airtableTables = airtableTablesResponse.data.tables;

      updateProgress(10, `Retrieved ${airtableTables.length} tables from Airtable`);

      // Crear un mapa para búsqueda rápida
      const airtableTablesMap = new Map();
      airtableTables.forEach(table => {
        airtableTablesMap.set(table.name, table);
      });

      // Procesar cada tabla
      let totalItemsToProcess = 0;
      const processingItems = [];

      // Contar total de elementos a procesar (tablas + campos)
      tables.forEach(table => {
        totalItemsToProcess++; // Contar la tabla

        // Contar campos usando regex
        const fieldPattern = /(\w+)\s+.*?\[note:\s*(.*?)\]/g;
        let fieldMatch;
        let fieldCount = 0;
        
        while ((fieldMatch = fieldPattern.exec(table.content)) !== null) {
          fieldCount++;
        }

        totalItemsToProcess += fieldCount;
        processingItems.push({
          tableName: table.name,
          fieldCount,
        });
      });

      updateProgress(15, `Total items to process: ${totalItemsToProcess}`);

      // Comenzar la actualización
      let processedItems = 0;
      const results = {
        tablesProcessed: 0,
        tablesUpdated: 0,
        tablesRenamed: 0,
        fieldsProcessed: 0,
        fieldsUpdated: 0,
        fieldsRenamed: 0,
        errors: [],
      };

      for (const table of tables) {
        processedItems++;
        const progressPct = Math.floor((processedItems / totalItemsToProcess) * 100);
        updateProgress(progressPct, `Processing table: ${table.name}`);

        results.tablesProcessed++;

        // Buscar la tabla correspondiente en Airtable
        const airtableTable = airtableTablesMap.get(table.name);
        if (!airtableTable) {
          results.errors.push(`Table ${table.name} not found in Airtable`);
          continue;
        }

        // Check if table is protected (declare once per table iteration)
        const isTableProtected = airtableConfig.protectedTables?.includes(table.name) || false;

        // Extraer descripción de la tabla
        const tableDescPattern = /note:\s*'(###.*?)(?:'\s*$|\s*-\s*(.*)'\s*$)/m;
        const tableDescMatch = tableDescPattern.exec(table.content);
        
        let tableDescription = '';
        if (tableDescMatch && tableDescMatch[2]) {
          tableDescription = this.cleanDescription(tableDescMatch[2]);
          
          // Verificar si la tabla ya tiene descripción y si no está protegida
          if (!airtableTable.description || (airtableConfig.forceUpdate && !isTableProtected)) {
            // Actualizar descripción de la tabla
            await this.updateTableDescription(
              airtableConfig, 
              airtableTable.id, 
              tableDescription
            );
            results.tablesUpdated++;
          }
        }

        // Convert table name to snake_case if requested
        if (airtableConfig.convertToSnakeCase && !isTableProtected) {
          const currentTableName = airtableTable.name;
          if (!this.isSnakeCase(currentTableName)) {
            const snakeCaseName = this.convertToSnakeCase(currentTableName);
            if (snakeCaseName !== currentTableName) {
              await this.updateTableName(
                airtableConfig,
                airtableTable.id,
                snakeCaseName
              );
              results.tablesRenamed++;
            }
          }
        }

        // Crear mapa de campos de Airtable para búsqueda rápida
        const airtableFieldsMap = new Map();
        airtableTable.fields.forEach(field => {
          airtableFieldsMap.set(field.name, field);
        });

        // Extraer campos y descripciones
        const fieldPattern = /(\w+)\s+.*?\[note:\s*(.*?)\]/g;
        let fieldMatch;
        
        while ((fieldMatch = fieldPattern.exec(table.content)) !== null) {
          processedItems++;
          const progressPct = Math.floor((processedItems / totalItemsToProcess) * 100);
          
          const fieldName = fieldMatch[1];
          updateProgress(progressPct, `Processing field: ${table.name}.${fieldName}`);
          
          results.fieldsProcessed++;
          
          // Extraer la descripción
          const rawDescription = fieldMatch[2];
          
          // Obtener la parte de "business desc"
          const businessDescPattern = /business desc:\s*(.*?)(?:,\s*technical desc:|$)/;
          const businessDescMatch = businessDescPattern.exec(rawDescription);
          
          if (!businessDescMatch) {
            results.errors.push(`No business description found for field ${table.name}.${fieldName}`);
            continue;
          }
          
          const fieldDescription = businessDescMatch[1].trim();
          
          // Buscar el campo en Airtable
          const airtableField = airtableFieldsMap.get(fieldName);
          if (!airtableField) {
            results.errors.push(`Field ${fieldName} not found in table ${table.name}`);
            continue;
          }
          
          // Verificar si el campo ya tiene descripción y si la tabla no está protegida
          if (!airtableField.description || (airtableConfig.forceUpdate && !isTableProtected)) {
            // Actualizar descripción del campo
            await this.updateFieldDescription(
              airtableConfig,
              airtableTable.id,
              airtableField.id,
              fieldDescription
            );
            results.fieldsUpdated++;
          }
        }

        // Convert all field names to snake_case if requested (process ALL fields, not just DBML fields)
        if (airtableConfig.convertToSnakeCase && !isTableProtected) {
          for (const airtableField of airtableTable.fields) {
            const currentFieldName = airtableField.name;
            if (!this.isSnakeCase(currentFieldName)) {
              const snakeCaseName = this.convertToSnakeCase(currentFieldName);
              if (snakeCaseName !== currentFieldName) {
                await this.updateFieldName(
                  airtableConfig,
                  airtableTable.id,
                  airtableField.id,
                  snakeCaseName
                );
                results.fieldsRenamed++;
              }
            }
          }
        }
      }

      // Process ALL Airtable tables for snake_case conversion (not just DBML tables)
      // Get fresh table list to ensure we process all tables, including any that weren't in DBML
      if (airtableConfig.convertToSnakeCase) {
        updateProgress(95, 'Processing all Airtable tables for snake_case conversion');
        
        // Get fresh list of all tables from Airtable
        const freshTablesResponse = await axios.get(allTablesUrl, { headers });
        const freshAirtableTables = freshTablesResponse.data.tables;
        
        for (const airtableTable of freshAirtableTables) {
          const isTableProtected = airtableConfig.protectedTables?.includes(airtableTable.name) || false;
          
          if (!isTableProtected) {
            // Convert table name to snake_case
            const currentTableName = airtableTable.name;
            if (!this.isSnakeCase(currentTableName)) {
              const snakeCaseName = this.convertToSnakeCase(currentTableName);
              if (snakeCaseName !== currentTableName) {
                await this.updateTableName(
                  airtableConfig,
                  airtableTable.id,
                  snakeCaseName
                );
                results.tablesRenamed++;
              }
            }

            // Convert all field names to snake_case
            for (const airtableField of airtableTable.fields) {
              const currentFieldName = airtableField.name;
              if (!this.isSnakeCase(currentFieldName)) {
                const snakeCaseName = this.convertToSnakeCase(currentFieldName);
                if (snakeCaseName !== currentFieldName) {
                  await this.updateFieldName(
                    airtableConfig,
                    airtableTable.id,
                    airtableField.id,
                    snakeCaseName
                  );
                  results.fieldsRenamed++;
                }
              }
            }
          }
        }
      }

      updateProgress(100, `Completed: ${results.tablesUpdated} tables updated, ${results.tablesRenamed} tables renamed, ${results.fieldsUpdated} fields updated, ${results.fieldsRenamed} fields renamed`);
      
      // Generar reporte final
      return JSON.stringify(results, null, 2);
    } catch (error) {
      this.logger.error(`Error processing DBML: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Limpia una descripción removiendo partes técnicas
   */
  private cleanDescription(description: string): string {
    return description.trim();
  }

  /**
   * Actualiza la descripción de una tabla en Airtable
   */
  private async updateTableDescription(
    config: AirtableConfig, 
    tableId: string, 
    description: string
  ): Promise<void> {
    try {
      const url = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables/${tableId}`;
      const headers = {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      };
      
      await axios.patch(url, { description }, { headers });
      
      // Esperar un poco para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      this.logger.error(`Error updating table ${tableId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza la descripción de un campo en Airtable
   */
  private async updateFieldDescription(
    config: AirtableConfig, 
    tableId: string, 
    fieldId: string, 
    description: string
  ): Promise<void> {
    try {
      const url = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables/${tableId}/fields/${fieldId}`;
      const headers = {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      };
      
      await axios.patch(url, { description }, { headers });
      
      // Esperar un poco para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      this.logger.error(`Error updating field ${fieldId} in table ${tableId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifies if a field name is already in snake_case format
   */
  private isSnakeCase(fieldName: string): boolean {
    // Snake case pattern: only lowercase letters, numbers, and underscores
    // Must not start or end with underscore, and no consecutive underscores
    const snakeCasePattern = /^[a-z][a-z0-9_]*[a-z0-9]$|^[a-z]$/;
    return snakeCasePattern.test(fieldName) && !fieldName.includes('__');
  }

  /**
   * Converts a field name to snake_case format
   */
  private convertToSnakeCase(fieldName: string): string {
    // If already in snake_case, return as is
    if (this.isSnakeCase(fieldName)) {
      return fieldName;
    }

    let result = fieldName;

    // Handle camelCase and PascalCase: insert underscore before uppercase letters
    result = result.replace(/([a-z0-9])([A-Z])/g, '$1_$2');

    // Handle kebab-case: replace hyphens with underscores
    result = result.replace(/-/g, '_');

    // Handle spaces: replace with underscores
    result = result.replace(/\s+/g, '_');

    // Handle special characters: remove or replace
    result = result.replace(/[^a-zA-Z0-9_]/g, '');

    // Convert to lowercase
    result = result.toLowerCase();

    // Remove consecutive underscores
    result = result.replace(/_+/g, '_');

    // Remove leading and trailing underscores
    result = result.replace(/^_+|_+$/g, '');

    return result;
  }

  /**
   * Updates the name of a field in Airtable
   */
  private async updateFieldName(
    config: AirtableConfig,
    tableId: string,
    fieldId: string,
    newName: string
  ): Promise<void> {
    try {
      const url = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables/${tableId}/fields/${fieldId}`;
      const headers = {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      };
      
      await axios.patch(url, { name: newName }, { headers });
      
      // Esperar un poco para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      this.logger.error(`Error updating field name ${fieldId} in table ${tableId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates the name of a table in Airtable
   */
  private async updateTableName(
    config: AirtableConfig,
    tableId: string,
    newName: string
  ): Promise<void> {
    try {
      const url = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables/${tableId}`;
      const headers = {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      };
      
      await axios.patch(url, { name: newName }, { headers });
      
      // Esperar un poco para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      this.logger.error(`Error updating table name ${tableId}: ${error.message}`);
      throw error;
    }
  }

  async processDbmlContentAndUpdateAirtable(
    airtableConfig: AirtableConfig,
    dbmlContent: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    try {
      // Validar que el contenido sea válido
      if (!dbmlContent || dbmlContent.trim() === '') {
        throw new Error('DBML content is empty or invalid');
      }
      
      // Extraer tablas del DBML usando regex
      const tablePattern = /Table\s+(\w+)\s*{([^}]+)}/g;
      const tables = [];
      let match;
      
      while ((match = tablePattern.exec(dbmlContent)) !== null) {
        tables.push({
          name: match[1],
          content: match[2],
        });
      }

      if (tables.length === 0) {
        throw new Error('No tables found in DBML content');
      }

      updateProgress(5, `Found ${tables.length} tables to process`);

      // Obtener información de todas las tablas de Airtable
      const allTablesUrl = `https://api.airtable.com/v0/meta/bases/${airtableConfig.baseId}/tables`;
      const headers = {
        Authorization: `Bearer ${airtableConfig.accessToken}`,
        'Content-Type': 'application/json',
      };

      const airtableTablesResponse = await axios.get(allTablesUrl, { headers });
      const airtableTables = airtableTablesResponse.data.tables;

      updateProgress(10, `Retrieved ${airtableTables.length} tables from Airtable`);

      // Crear un mapa para búsqueda rápida
      const airtableTablesMap = new Map();
      airtableTables.forEach(table => {
        airtableTablesMap.set(table.name, table);
      });

      // Procesar cada tabla
      let totalItemsToProcess = 0;
      const processingItems = [];

      // Contar total de elementos a procesar (tablas + campos)
      tables.forEach(table => {
        totalItemsToProcess++; // Contar la tabla

        // Contar campos usando regex
        const fieldPattern = /(\w+)\s+.*?\[note:\s*(.*?)\]/g;
        let fieldMatch;
        let fieldCount = 0;
        
        while ((fieldMatch = fieldPattern.exec(table.content)) !== null) {
          fieldCount++;
        }

        totalItemsToProcess += fieldCount;
        processingItems.push({
          tableName: table.name,
          fieldCount,
        });
      });

      updateProgress(15, `Total items to process: ${totalItemsToProcess}`);

      // Comenzar la actualización
      let processedItems = 0;
      const results = {
        tablesProcessed: 0,
        tablesUpdated: 0,
        tablesRenamed: 0,
        fieldsProcessed: 0,
        fieldsUpdated: 0,
        fieldsRenamed: 0,
        errors: [],
      };

      for (const table of tables) {
        processedItems++;
        const progressPct = Math.floor((processedItems / totalItemsToProcess) * 100);
        updateProgress(progressPct, `Processing table: ${table.name}`);

        results.tablesProcessed++;

        // Buscar la tabla correspondiente en Airtable
        const airtableTable = airtableTablesMap.get(table.name);
        if (!airtableTable) {
          results.errors.push(`Table ${table.name} not found in Airtable`);
          continue;
        }

        // Check if table is protected (declare once per table iteration)
        const isTableProtected = airtableConfig.protectedTables?.includes(table.name) || false;

        // Extraer descripción de la tabla
        const tableDescPattern = /note:\s*'(###.*?)(?:'\s*$|\s*-\s*(.*)'\s*$)/m;
        const tableDescMatch = tableDescPattern.exec(table.content);
        
        let tableDescription = '';
        if (tableDescMatch && tableDescMatch[2]) {
          tableDescription = this.cleanDescription(tableDescMatch[2]);
          
          // Verificar si la tabla ya tiene descripción y si no está protegida
          if (!airtableTable.description || (airtableConfig.forceUpdate && !isTableProtected)) {
            // Actualizar descripción de la tabla
            await this.updateTableDescription(
              airtableConfig, 
              airtableTable.id, 
              tableDescription
            );
            results.tablesUpdated++;
          }
        }

        // Convert table name to snake_case if requested
        if (airtableConfig.convertToSnakeCase && !isTableProtected) {
          const currentTableName = airtableTable.name;
          if (!this.isSnakeCase(currentTableName)) {
            const snakeCaseName = this.convertToSnakeCase(currentTableName);
            if (snakeCaseName !== currentTableName) {
              await this.updateTableName(
                airtableConfig,
                airtableTable.id,
                snakeCaseName
              );
              results.tablesRenamed++;
            }
          }
        }

        // Crear mapa de campos de Airtable para búsqueda rápida
        const airtableFieldsMap = new Map();
        airtableTable.fields.forEach(field => {
          airtableFieldsMap.set(field.name, field);
        });

        // Extraer campos y descripciones
        const fieldPattern = /(\w+)\s+.*?\[note:\s*(.*?)\]/g;
        let fieldMatch;
        
        while ((fieldMatch = fieldPattern.exec(table.content)) !== null) {
          processedItems++;
          const progressPct = Math.floor((processedItems / totalItemsToProcess) * 100);
          
          const fieldName = fieldMatch[1];
          updateProgress(progressPct, `Processing field: ${table.name}.${fieldName}`);
          
          results.fieldsProcessed++;
          
          // Extraer la descripción
          const rawDescription = fieldMatch[2];
          
          // Obtener la parte de "business desc"
          const businessDescPattern = /business desc:\s*(.*?)(?:,\s*technical desc:|$)/;
          const businessDescMatch = businessDescPattern.exec(rawDescription);
          
          if (!businessDescMatch) {
            results.errors.push(`No business description found for field ${table.name}.${fieldName}`);
            continue;
          }
          
          const fieldDescription = businessDescMatch[1].trim();
          
          // Buscar el campo en Airtable
          const airtableField = airtableFieldsMap.get(fieldName);
          if (!airtableField) {
            results.errors.push(`Field ${fieldName} not found in table ${table.name}`);
            continue;
          }
          
          // Verificar si el campo ya tiene descripción y si la tabla no está protegida
          if (!airtableField.description || (airtableConfig.forceUpdate && !isTableProtected)) {
            // Actualizar descripción del campo
            await this.updateFieldDescription(
              airtableConfig,
              airtableTable.id,
              airtableField.id,
              fieldDescription
            );
            results.fieldsUpdated++;
          }
        }

        // Convert all field names to snake_case if requested (process ALL fields, not just DBML fields)
        if (airtableConfig.convertToSnakeCase && !isTableProtected) {
          for (const airtableField of airtableTable.fields) {
            const currentFieldName = airtableField.name;
            if (!this.isSnakeCase(currentFieldName)) {
              const snakeCaseName = this.convertToSnakeCase(currentFieldName);
              if (snakeCaseName !== currentFieldName) {
                await this.updateFieldName(
                  airtableConfig,
                  airtableTable.id,
                  airtableField.id,
                  snakeCaseName
                );
                results.fieldsRenamed++;
              }
            }
          }
        }
      }

      // Process ALL Airtable tables for snake_case conversion (not just DBML tables)
      // Get fresh table list to ensure we process all tables, including any that weren't in DBML
      if (airtableConfig.convertToSnakeCase) {
        updateProgress(95, 'Processing all Airtable tables for snake_case conversion');
        
        // Get fresh list of all tables from Airtable
        const freshTablesResponse = await axios.get(allTablesUrl, { headers });
        const freshAirtableTables = freshTablesResponse.data.tables;
        
        for (const airtableTable of freshAirtableTables) {
          const isTableProtected = airtableConfig.protectedTables?.includes(airtableTable.name) || false;
          
          if (!isTableProtected) {
            // Convert table name to snake_case
            const currentTableName = airtableTable.name;
            if (!this.isSnakeCase(currentTableName)) {
              const snakeCaseName = this.convertToSnakeCase(currentTableName);
              if (snakeCaseName !== currentTableName) {
                await this.updateTableName(
                  airtableConfig,
                  airtableTable.id,
                  snakeCaseName
                );
                results.tablesRenamed++;
              }
            }

            // Convert all field names to snake_case
            for (const airtableField of airtableTable.fields) {
              const currentFieldName = airtableField.name;
              if (!this.isSnakeCase(currentFieldName)) {
                const snakeCaseName = this.convertToSnakeCase(currentFieldName);
                if (snakeCaseName !== currentFieldName) {
                  await this.updateFieldName(
                    airtableConfig,
                    airtableTable.id,
                    airtableField.id,
                    snakeCaseName
                  );
                  results.fieldsRenamed++;
                }
              }
            }
          }
        }
      }

      updateProgress(100, `Completed: ${results.tablesUpdated} tables updated, ${results.tablesRenamed} tables renamed, ${results.fieldsUpdated} fields updated, ${results.fieldsRenamed} fields renamed`);
      
      // Generar reporte final
      return JSON.stringify(results, null, 2);
    } catch (error) {
      this.logger.error(`Error processing DBML: ${error.message}`, error.stack);
      throw error;
    }
  }
}
