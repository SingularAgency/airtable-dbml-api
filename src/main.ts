import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: true, // Esto permitirá solicitudes desde cualquier origen, ajustar para producción
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    },
  });

  // Aumentamos el límite a 100MB para manejar esquemas de Airtable muy grandes
  app.use(bodyParser.json({ limit: '100mb' }));
  app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
  
  // Configuramos límites adicionales para Express
  app.set('maxHttpBufferSize', 100 * 1024 * 1024); // 100MB
  app.set('requestTimeout', 300000); // 5 minutos para timeout

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Airtable to DBML API')
    .setDescription(`
    # Airtable to DBML Documentation API with AI
    
    This API provides a complete workflow for Airtable schema documentation, from schema extraction to AI-powered descriptions generation and documentation updates.
    
    ## Complete Documentation Workflow
    
    1. **Extract Schema**: Automatically extract schema directly from Airtable using credentials
    2. **Generate DBML**: Convert the schema to DBML with AI-generated business descriptions
    3. **Update Airtable**: Apply the generated descriptions back to Airtable
    
    ## Core Features
    
    - **Schema Extraction**: Connect directly to Airtable to extract complete schema
    - **AI-Powered Descriptions**: Generate meaningful business descriptions using Gemini AI
    - **LLM-Free Mode**: Option to disable AI generation and use predefined description strategies
    - **Query Parameters**: Use useAI=false to disable AI generation, useAirtableTypes=true for Airtable field types
    - **Documentation Updates**: Apply generated descriptions back to Airtable
    - **Modular Design**: Use each component independently or chain them together
    - **Asynchronous Processing**: Handle large schemas with background processing
    - **Real-time Updates**: WebSocket notifications for job progress and completion
    
    ## Business Description Strategies (when LLM is disabled)
    
    When you set useAI=false as a query parameter or disableLLM: true in the Gemini configuration, you can choose from three strategies:
    
    - **technical_simple**: Simple technical descriptions (e.g., "Employee Name field", "Employees table")
    - **type_based**: Descriptions based on field type (e.g., "Text field for storing single line data")
    - **hybrid** (default): Combination of name and type information (e.g., "Employee Name - Text field for storing employee names")
    
    ## Quick Usage Examples
    
    - **With AI**: POST /json-dbml/generate (default behavior)
    - **Without AI**: POST /json-dbml/generate?useAI=false
    - **Airtable Types**: POST /json-dbml/generate?useAirtableTypes=true
    - **Both**: POST /json-dbml/generate?useAI=false&useAirtableTypes=true
    `)
    .setVersion('1.4')
    .addTag('schema-extractor', 'Airtable schema extraction endpoints')
    .addTag('dbml', 'DBML generation endpoints')
    .addTag('airtable-docs', 'Airtable documentation endpoints')
    .addTag('jobs', 'Background job management endpoints')
    .addTag('websockets', 'Real-time update connections')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
