import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SchemaExtractorService {
  private readonly logger = new Logger(SchemaExtractorService.name);

  /**
   * Extrae el esquema completo de una base de Airtable
   */
  async extractAirtableSchema(
    baseId: string,
    accessToken: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    try {
      updateProgress(10, 'Connecting to Airtable API');
      
      // Construir la URL de la API
      const apiUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      
      // Configurar los headers con el token de autenticación
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };
      
      // Realizar la petición a la API de Airtable
      updateProgress(30, 'Fetching schema from Airtable');
      const response = await axios.get(apiUrl, { headers });
      
      // Verificar que la respuesta contiene las tablas
      if (!response.data || !response.data.tables) {
        throw new Error('Invalid response from Airtable API: tables data not found');
      }
      
      updateProgress(70, `Retrieved schema with ${response.data.tables.length} tables`);
      
      // El esquema ya viene en el formato esperado: { tables: [] }
      // Esto es compatible directamente con el endpoint de generación DBML
      const schema = {
        tables: response.data.tables
      };
      
      updateProgress(100, 'Schema extraction completed successfully');
      
      // Devolver el esquema como string JSON
      return JSON.stringify(schema, null, 2);
    } catch (error) {
      this.logger.error(`Error extracting Airtable schema: ${error.message}`, error.stack);
      
      // Si es un error de la API, dar más detalles
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        throw new Error(`Airtable API error (${status}): ${JSON.stringify(data)}`);
      }
      
      throw error;
    }
  }
}
