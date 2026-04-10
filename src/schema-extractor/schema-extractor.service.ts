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
      this.logger.log(`Starting schema extraction for base: ${baseId}`);
      this.logger.log(`Token format check: ${accessToken.substring(0, 10)}...`);
      this.logger.log(`Base ID format check: ${baseId.substring(0, 10)}...`);
      
      // Validate token format - Airtable tokens can start with 'pat' followed by various characters
      if (!accessToken.startsWith('pat')) {
        this.logger.error(`Token validation failed: ${accessToken.substring(0, 20)}...`);
        throw new Error('Invalid Personal Access Token format. Token must start with "pat"');
      }
      
      // Validate base ID format
      if (!baseId.startsWith('app')) {
        this.logger.error(`Base ID validation failed: ${baseId}`);
        throw new Error('Invalid Base ID format. Base ID must start with "app"');
      }
      
      this.logger.log('Token and Base ID validation passed');
      updateProgress(10, 'Connecting to Airtable API');
      
      // Construir la URL de la API
      const apiUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      this.logger.log(`Making request to: ${apiUrl}`);
      this.logger.log(`Headers: Authorization: Bearer ${accessToken.substring(0, 20)}...`);
      
      // Configurar los headers con el token de autenticación
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };
      
      // Realizar la petición a la API de Airtable
      updateProgress(30, 'Fetching schema from Airtable');
      this.logger.log('Sending request to Airtable API...');
      
      // Configurar axios con timeout y configuración adicional
      const axiosConfig = {
        headers,
        timeout: 90000, // 90 segundos
        validateStatus: (status: number) => status < 500, // Aceptar respuestas 4xx como válidas
      };
      
      const response = await axios.get(apiUrl, axiosConfig);
      this.logger.log(`Response received: Status ${response.status}, Data keys: ${Object.keys(response.data || {}).join(', ')}`);
      
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
      this.logger.error(`Error extracting Airtable schema: ${error.message}`);
      
      // Log additional error details for debugging
      if (error.code) {
        this.logger.error(`Error code: ${error.code}`);
      }
      if (error.syscall) {
        this.logger.error(`System call: ${error.syscall}`);
      }
      if (error.hostname) {
        this.logger.error(`Hostname: ${error.hostname}`);
      }
      
      // Si es un error de la API, dar más detalles
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        const headers = error.response.headers;
        
        this.logger.error(`HTTP Error Details: Status ${status}, Headers: ${JSON.stringify(headers)}`);
        this.logger.error(`Response Data: ${JSON.stringify(data)}`);
        
        // Provide specific guidance for common errors
        let errorMessage = `Airtable API error (${status}): `;
        
        switch (status) {
          case 401:
            errorMessage += 'Unauthorized - Check if your Personal Access Token is valid and not expired';
            break;
          case 403:
            errorMessage += 'Forbidden - Your token may not have permission to access this base, or the base ID is incorrect';
            break;
          case 404:
            errorMessage += 'Base not found - Check if the Base ID is correct';
            break;
          case 429:
            errorMessage += 'Rate limit exceeded - Try again later';
            break;
          default:
            errorMessage += JSON.stringify(data);
        }
        
        throw new Error(errorMessage);
      }
      
      // Handle network errors
      if (error.code === 'ENOTFOUND') {
        throw new Error('Network error: Could not resolve hostname. Check your internet connection.');
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Network error: Connection refused. Check if the Airtable API is accessible.');
      }
      if (error.code === 'ETIMEDOUT') {
        throw new Error('Network error: Request timed out. The Airtable API took too long to respond.');
      }
      
      throw error;
    }
  }
}
