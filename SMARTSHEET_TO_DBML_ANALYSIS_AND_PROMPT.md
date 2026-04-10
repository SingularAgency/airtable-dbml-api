# SmartSheet to DBML Converter - Analysis and Implementation Prompt

## Objetivo

Crear un endpoint en la API REST que convierta datos de SmartSheet (en formato JSON) a DBML, igual que se hace actualmente con Airtable. El endpoint debe permitir elegir entre tres modos de tipos de datos en el DBML generado:
- **DBML estándar**: Tipos DBML estándar (varchar, date, boolean, etc.)
- **SmartSheet**: Tipos originales de SmartSheet (TEXT_NUMBER, DATE, CHECKBOX, etc.)
- **Airtable**: Tipos de Airtable (singleLineText, formula, date, etc.)

Adicionalmente, para campos de tipo `formula`, el sistema debe:
- Documentar la fórmula completa en `technical_desc`
- Generar un análisis con IA de lo que hace la fórmula en `business_desc`

---

## 1. Análisis de la Estructura del JSON SmartSheet

### Estructura General

El JSON de SmartSheet tiene la siguiente estructura:

```json
[
  {
    "totalSheets": 61,
    "totalColumns": 1479,
    "data_dictionary": [
      {
        "sheet_id": 434135274311556,
        "sheet_name": "Monomers & Consumables",
        "path": null,
        "permalink": "https://app.smartsheet.com/sheets/...",
        "table_name": "monomers_consumables_311556",
        "inferFromRows": false,
        "columns": [
          {
            "column_id": 2034768651440004,
            "title": "Month",
            "field_name_snake": "month",
            "smartsheet_type": "TEXT_NUMBER",
            "smartsheet_systemColumnType": null,
            "is_computed": true,
            "column_formula": "=IF([Month Helper]@row = 1, \"January\", ...)",
            "detected_formula_cell_count": 0,
            "sample_formulas": [],
            "observed_value_types": [],
            "dbml_type": "singleSelect",
            "select_options": ["January", "February", "March", ...],
            "formula_return_type": null,
            "formula_translation_status": "TODO",
            "smartsheet_formula_original": "=IF([Month Helper]@row = 1, \"January\", ...)",
            "airtable_formula_candidate": "AUTO_TRANSLATE",
            "sample_values": [],
            "business_desc": "",
            "technical_desc": "Type: singleSelect. Options: January, February, ..."
          }
        ]
      }
    ]
  }
]
```

### Campos Clave por Columna

- **`column_id`**: ID único de la columna (número) - se convertirá a string para Airtable
- **`title`**: Nombre de la columna - será el nombre del campo
- **`field_name_snake`**: Nombre en snake_case - útil para referencia
- **`smartsheet_type`**: Tipo original en SmartSheet (TEXT_NUMBER, DATE, CHECKBOX, PICKLIST, CURRENCY, CONTACT_LIST, MULTI_CONTACT_LIST)
- **`is_computed`**: Boolean que indica si es un campo calculado (fórmula)
- **`column_formula`**: Fórmula de SmartSheet (si existe)
- **`dbml_type`**: Tipo sugerido por el compañero (necesita validación)
- **`select_options`**: Array de opciones si es un campo de selección
- **`formula_return_type`**: Tipo de retorno de la fórmula ("number", "singleLineText", null)
- **`business_desc`**: Descripción de negocio (puede estar vacía)
- **`technical_desc`**: Descripción técnica con información del campo

---

## 2. Patrones de Mapeo de Tipos Identificados

### 2.1. TEXT_NUMBER (Tipo más complejo)

**Caso 1: Campo simple de texto**
- `is_computed: false` AND `column_formula: null`
- → **Mapeo**: `singleLineText`

**Caso 2: Campo de selección (singleSelect)**
- `is_computed: true` AND `select_options.length > 0`
- → **Mapeo**: `singleSelect`
- **Acción**: Usar `select_options` para poblar `options.choices`

**Caso 3: Fórmula que retorna número**
- `is_computed: true` AND `formula_return_type: "number"`
- → **Mapeo**: `formula` (tipo number en Airtable)

**Caso 4: Fórmula que retorna texto**
- `is_computed: true` AND `formula_return_type: "singleLineText"`
- → **Mapeo**: `formula` (tipo text en Airtable)

**Caso 5: Fórmula sin tipo de retorno definido**
- `is_computed: true` AND `formula_return_type: null`
- → **Mapeo**: `formula` (default a text)

**Ejemplo real:**
```json
{
  "smartsheet_type": "TEXT_NUMBER",
  "is_computed": true,
  "column_formula": "=SUM([Total Monomers]@row, [Total Consumables]@row)",
  "formula_return_type": "number",
  "dbml_type": "formula"
}
```

### 2.2. DATE

- `smartsheet_type: "DATE"`
- → **Mapeo**: `date`

**Ejemplo:**
```json
{
  "smartsheet_type": "DATE",
  "is_computed": false,
  "column_formula": null,
  "dbml_type": "date"
}
```

### 2.3. CHECKBOX

- `smartsheet_type: "CHECKBOX"`
- → **Mapeo**: `checkbox`

**Ejemplo:**
```json
{
  "smartsheet_type": "CHECKBOX",
  "is_computed": false,
  "dbml_type": "checkbox"
}
```

### 2.4. PICKLIST

- `smartsheet_type: "PICKLIST"`
- → **Mapeo**: `singleSelect`
- **Nota**: Si hay `select_options`, usarlos para `options.choices`

**Ejemplo:**
```json
{
  "smartsheet_type": "PICKLIST",
  "select_options": ["Option1", "Option2"],
  "dbml_type": "singleSelect"
}
```

### 2.5. CURRENCY

- `smartsheet_type: "CURRENCY"`
- → **Mapeo**: `currency`

### 2.6. CONTACT_LIST

- `smartsheet_type: "CONTACT_LIST"`
- → **Mapeo**: `singleLineText`

### 2.7. MULTI_CONTACT_LIST

- `smartsheet_type: "MULTI_CONTACT_LIST"`
- → **Mapeo**: `multipleSelects`
- **Nota**: Si hay `select_options`, usarlos para `options.choices`

---

## 3. Validaciones Necesarias

### Validación 1: singleSelect sin opciones
**Problema**: Si `dbml_type` es `singleSelect` pero `select_options` está vacío
**Solución**: Cambiar a `singleLineText`

### Validación 2: Fórmula sin is_computed
**Problema**: Si `dbml_type` es `formula` pero `is_computed: false`
**Solución**: Cambiar al tipo apropiado basado en `smartsheet_type`

### Validación 3: Fórmula sin tipo de retorno
**Problema**: Si `dbml_type` es `formula` y `formula_return_type: null`
**Solución**: Default a text formula

### Validación 4: Inconsistencia entre dbml_type y tipo calculado
**Problema**: Si `dbml_type` no coincide con el tipo calculado según las reglas
**Solución**: Usar el tipo calculado y registrar un warning en logs

---

## 4. Estructura de Salida Esperada (Airtable Format)

El servicio `JsonDbmlService.processJsonToDbml()` espera este formato:

```typescript
{
  tables: [
    {
      id: string,              // Convertir sheet_id a string
      name: string,            // Usar sheet_name
      primaryFieldId: string,  // Convertir primer column_id a string
      fields: [
        {
          id: string,         // Convertir column_id a string
          type: string,       // Tipo Airtable (singleLineText, formula, date, etc.)
          name: string,        // Usar title
          description?: string, // business_desc (para fórmulas: análisis generado por IA)
          options?: {
            choices?: string[], // Para singleSelect/multipleSelects
            originalSmartSheetType?: string, // Tipo original de SmartSheet
            smartsheetFormula?: string // Fórmula de SmartSheet (para campos formula)
          }
        }
      ],
      description?: string
    }
  ],
  geminiConfig?: {
    model?: string,
    overwriteFieldDescriptions?: boolean,
    overwriteTableDescriptions?: boolean,
    disableLLM?: boolean,
    businessDescriptionStrategy?: string
  }
}
```

### 4.1. Manejo Especial de Campos Formula

Para campos de tipo `formula`:
- **`options.smartsheetFormula`**: Se almacena la fórmula original de SmartSheet (`column_formula`)
- **`description`**: Contiene un análisis generado por IA explicando qué hace la fórmula (si `useAI` está habilitado)
- **`technical_desc`**: Se genera automáticamente incluyendo la fórmula: `Type: formula, SmartSheet Formula: [fórmula], field ID: ...`

El análisis de la fórmula se genera usando `GeminiService` con un prompt especializado que analiza la fórmula y proporciona una descripción de negocio concisa (máximo 150 caracteres) explicando qué calcula o determina la fórmula.

---

## 5. Prompt para LLM - Implementación del Endpoint

```
# Task: Create SmartSheet to DBML Converter Endpoint

You need to create a new endpoint in a NestJS API that converts SmartSheet JSON data to Airtable-compatible JSON format, which can then be processed by the existing `JsonDbmlService.processJsonToDbml()` method to generate DBML.

## Context

The existing API has:
- A `JsonDbmlService` that processes Airtable schema JSON and generates DBML
- The service expects JSON in this format (see CreateJsonDbmlDto):
  ```typescript
  {
    tables: [
      {
        id: string,
        name: string,
        primaryFieldId: string,
        fields: [
          {
            id: string,
            type: string, // Airtable field type
            name: string,
            description?: string,
            options?: {
              choices?: string[],
              linkedTableId?: string,
              // ... other options
            }
          }
        ],
        description?: string
      }
    ],
    geminiConfig?: {...}
  }
  ```

- The service has a method `processJsonToDbml(jsonGlobal: any, useAirtableTypes: boolean)` where:
  - `useAirtableTypes: true` → Uses Airtable field types in DBML (e.g., "singleLineText", "formula")
  - `useAirtableTypes: false` → Maps to DBML types (e.g., "varchar", "date", "boolean")

## Input Format (SmartSheet JSON)

The SmartSheet JSON has this structure:
```json
[
  {
    "totalSheets": number,
    "totalColumns": number,
    "data_dictionary": [
      {
        "sheet_id": number,
        "sheet_name": string,
        "table_name": string,
        "columns": [
          {
            "column_id": number,
            "title": string,
            "field_name_snake": string,
            "smartsheet_type": "TEXT_NUMBER" | "DATE" | "CHECKBOX" | "PICKLIST" | "CURRENCY" | "CONTACT_LIST" | "MULTI_CONTACT_LIST",
            "is_computed": boolean,
            "column_formula": string | null,
            "dbml_type": string, // Suggested Airtable type (needs validation)
            "select_options": string[],
            "formula_return_type": "number" | "singleLineText" | null,
            "business_desc": string,
            "technical_desc": string
          }
        ]
      }
    ]
  }
]
```

## Field Type Mapping Rules

You must implement a function that maps SmartSheet columns to Airtable fields following these rules:

### 1. TEXT_NUMBER type:
- If `is_computed: false` AND `column_formula: null` → `singleLineText`
- If `is_computed: true` AND `select_options.length > 0` → `singleSelect` (use select_options for choices)
- If `is_computed: true` AND `formula_return_type: "number"` → `formula` (type: number)
- If `is_computed: true` AND `formula_return_type: "singleLineText"` → `formula` (type: text)
- If `is_computed: true` AND `formula_return_type: null` → `formula` (default to text)

### 2. DATE type:
- Always → `date`

### 3. CHECKBOX type:
- Always → `checkbox`

### 4. PICKLIST type:
- Always → `singleSelect` (if select_options available, use them in options.choices)

### 5. CURRENCY type:
- Always → `currency`

### 6. CONTACT_LIST type:
- Always → `singleLineText`

### 7. MULTI_CONTACT_LIST type:
- Always → `multipleSelects` (if select_options available, use them in options.choices)

## Validation Rules

Before using the `dbml_type` from the JSON, validate it:
1. If `dbml_type` is `singleSelect` but `select_options` is empty → Change to `singleLineText`
2. If `dbml_type` is `formula` but `is_computed: false` → Change to appropriate type based on `smartsheet_type`
3. If `dbml_type` is `formula` and `formula_return_type: null` → Default to text formula
4. If `dbml_type` doesn't match the computed type → Use the computed type (log a warning)

## Implementation Requirements

1. Create a new controller endpoint: `POST /smartsheet-dbml/generate`
   - **Accept SmartSheet JSON in two ways:**
     - JSON body: Send SmartSheet JSON directly in request body
     - File upload: Upload JSON file using multipart/form-data with field name 'file'
   - **Query parameters:**
     - `typeMode` (string, optional, default: 'dbml'): `'dbml' | 'smartsheet' | 'airtable'`
       - Controls which types appear in DBML output
     - `useAI` (boolean, optional, default: true)
       - If false, disables AI generation for descriptions and formula analysis
   - **Response**: Async job (returns jobId, statusUrl, downloadUrl)
   - Similar pattern to `/json-dbml/generate-from-schema-job`

2. Create a service method: `convertSmartSheetToAirtableFormat(smartsheetJson: any, geminiConfig?: any): Promise<CreateJsonDbmlDto>`
   - **Must be async** to support AI formula analysis
   - Map each sheet in `data_dictionary` to a table
   - Use `sheet_id` as table `id` (convert number to string: `sheet_id.toString()`)
   - Use `sheet_name` as table `name`
   - Use the first column's `column_id` as `primaryFieldId` (convert to string)
   - Map each column to a field (async processing for formula analysis)
   - Use `column_id` as field `id` (convert to string)
   - Use `title` as field `name`
   - **For formula fields:**
     - Store formula in `options.smartsheetFormula`
     - Generate AI analysis using `GeminiService.generateContentWithPrompt()` if `useAI` is enabled
     - Use AI analysis as `description` (business_desc)
     - Fallback to existing `business_desc` or default if AI fails
   - **For non-formula fields:**
     - Use `business_desc` as field `description` if available and not empty
   - Apply the type mapping rules above
   - Store original SmartSheet type in `options.originalSmartSheetType` for type mode support
   - For `singleSelect` and `multipleSelects`, populate `options.choices` from `select_options`

3. Modify `JsonDbmlService.formatFieldNote()` to include SmartSheet formula in `technical_desc`:
   - Check if field type is `formula` and `options.smartsheetFormula` exists
   - Add to technical note: `, SmartSheet Formula: [fórmula]`

4. Modify `JsonDbmlService.mapFieldType()` to support three type modes:
   - Accept optional `typeMode` parameter: `'dbml' | 'smartsheet' | 'airtable'`
   - Accept optional `originalSmartSheetType` parameter
   - If `typeMode === 'smartsheet'` and `originalSmartSheetType` exists, return original type
   - If `typeMode === 'airtable'` or `useAirtableTypes === true`, return Airtable type
   - Otherwise, map to DBML standard types

5. After conversion, call the existing `JsonDbmlService.processJsonToDbmlWithProgress(convertedJson, useAirtableTypes, progressCallback, typeMode, getOriginalSmartSheetType)`
6. Return async job response with jobId (similar to existing `/json-dbml/generate-from-schema-job` endpoint)

## Code Structure

Follow the existing patterns in:
- `src/json-dbml/json-dbml.controller.ts` - for endpoint structure and Swagger documentation
- `src/json-dbml/json-dbml.service.ts` - for service patterns and field type mapping
- `src/json-dbml/Dto/create-json-dbml.dto.ts` - for DTO structure

## Key Implementation Details

1. **Type Mapping Function**: Create a private method `mapSmartSheetTypeToAirtable(column: any): string` that implements all the mapping rules above

2. **Validation Function**: Create a private method `validateAndCorrectFieldType(column: any, computedType: string): string` that applies validation rules

3. **Formula Analysis with AI**: Create a private method `generateFormulaAnalysis(fieldName: string, formula: string, modelName: string): Promise<string>` that:
   - Uses `GeminiService.generateContentWithPrompt()` with a specialized prompt
   - Prompt should ask AI to analyze the formula and provide a brief business description (under 150 characters)
   - Focus on what the formula calculates or determines, not technical implementation
   - Handle errors gracefully with fallback to existing `business_desc` or default

4. **Field Options**: 
   - For `singleSelect` and `multipleSelects`, format `select_options` array as:
     ```typescript
     options: {
       choices: select_options.map(opt => ({ name: opt }))
     }
     ```
   - For all fields, store `originalSmartSheetType` in options
   - For formula fields, store `smartsheetFormula` in options

5. **Async Processing**: 
   - `convertSmartSheetToAirtableFormat()` must be async to support AI formula analysis
   - Use `Promise.all()` for parallel processing of formula analyses
   - Use `Promise.all()` for processing multiple sheets

6. **Type Mode Support**:
   - Modify `JsonDbmlService.mapFieldType()` to accept `typeMode` and `originalSmartSheetType`
   - Pass `typeMode` and a function to get original SmartSheet type to `processJsonToDbmlWithProgress()`

7. **Error Handling**:
   - Validate that the input JSON has the expected structure
   - Log warnings when `dbml_type` doesn't match computed type
   - Handle missing or null values gracefully
   - Handle AI generation errors gracefully (fallback to existing descriptions)
   - Return appropriate HTTP error responses

8. **Swagger Documentation**: Document the endpoint with:
   - Description of the conversion process
   - Query parameters (`typeMode`, `useAI`)
   - Request body schema (JSON option)
   - File upload option (multipart/form-data)
   - Response format (async job)
   - Examples for each type mode

## Testing Considerations

- Test with the provided SmartSheet JSON file: `Unnatural Products SmartSheets data book.json.txt`
- Verify all field types are mapped correctly
- **Test formula fields:**
  - Verify formula is stored in `options.smartsheetFormula`
  - Verify formula appears in `technical_desc` of DBML output
  - Verify AI analysis is generated for `business_desc` when `useAI: true`
  - Verify fallback behavior when AI fails or `useAI: false`
- Check that select options are properly formatted
- Validate that the output can be processed by `JsonDbmlService`
- Test all three type modes: `dbml`, `smartsheet`, `airtable`
- Test with JSON body and file upload
- Test async job creation and status tracking

## Example Conversion

**Input (SmartSheet):**
```json
{
  "column_id": 2034768651440004,
  "title": "Month",
  "smartsheet_type": "TEXT_NUMBER",
  "is_computed": true,
  "select_options": ["January", "February", "March"],
  "dbml_type": "singleSelect"
}
```

**Output (Airtable format):**
```json
{
  "id": "2034768651440004",
  "type": "singleSelect",
  "name": "Month",
  "options": {
    "choices": [
      { "name": "January" },
      { "name": "February" },
      { "name": "March" }
    ]
  }
}
```

Generate the complete implementation including:
1. Controller with Swagger documentation
2. Service with conversion logic and validation
3. Proper error handling
4. Type validation and correction logic
5. Integration with existing JsonDbmlService
```

---

## 6. Notas Adicionales

### 6.1. Endpoint Implementation
- El endpoint debe ser similar a `/json-dbml/generate-from-schema-job` pero acepta formato SmartSheet
- Debe ser **asíncrono** (retorna jobId) para manejar procesamiento de grandes archivos y análisis de IA
- Acepta JSON en body O archivo (multipart/form-data)
- Debe usar el mismo `JsonDbmlService.processJsonToDbmlWithProgress()` para generar el DBML final

### 6.2. Type Modes
- **`typeMode: 'dbml'`** (default): Mapea tipos Airtable a tipos DBML estándar (varchar, date, boolean, etc.)
- **`typeMode: 'smartsheet'`**: Preserva tipos originales de SmartSheet (TEXT_NUMBER, DATE, CHECKBOX, etc.)
- **`typeMode: 'airtable'`**: Usa tipos de Airtable directamente (singleLineText, formula, date, etc.)
- El parámetro `useAirtableTypes` se calcula automáticamente: `true` si `typeMode === 'airtable' || typeMode === 'smartsheet'`

### 6.3. Formula Fields Handling
- **Fórmula en technical_desc**: Se agrega automáticamente en `formatFieldNote()` cuando detecta `options.smartsheetFormula`
- **Análisis en business_desc**: Se genera con IA usando `GeminiService` si `useAI !== 'false'`
- **Prompt para IA**: Especializado para analizar fórmulas de SmartSheet y explicar qué calculan
- **Fallback**: Si IA falla, usa `business_desc` existente o descripción por defecto
- **Almacenamiento**: La fórmula se guarda en `field.options.smartsheetFormula` durante la conversión

### 6.4. Dependencies
- Requiere `GeminiModule` importado en `SmartSheetDbmlModule` para análisis de fórmulas
- Requiere `JobModule` para procesamiento asíncrono
- Requiere `JsonDbmlModule` para generación de DBML
- Requiere `MulterModule` para soporte de archivos

### 6.5. Error Handling
- Los warnings deben loguearse pero no bloquear la conversión
- Errores de IA deben manejarse gracefully con fallbacks
- Validación de estructura JSON debe ocurrir antes de procesamiento

---

## 7. Archivos Creados/Modificados

### 7.1. Archivos Creados

1. **Controller**: `src/smartsheet-dbml/smartsheet-dbml.controller.ts`
   - Endpoint `POST /smartsheet-dbml/generate` (asíncrono)
   - Soporta JSON body y file upload
   - Query parameters: `typeMode`, `useAI`
   - Documentación Swagger completa

2. **Service**: `src/smartsheet-dbml/smartsheet-dbml.service.ts`
   - `convertSmartSheetToAirtableFormat()`: Conversión async con análisis de fórmulas
   - `mapSmartSheetTypeToAirtable()`: Mapeo de tipos
   - `validateAndCorrectFieldType()`: Validación y corrección
   - `generateFormulaAnalysis()`: Análisis de fórmulas con IA
   - `mapToDbmlType()`: Soporte para tres modos de tipo
   - `validateSmartSheetJson()`: Validación de estructura

3. **Module**: `src/smartsheet-dbml/smartsheet-dbml.module.ts`
   - Imports: `JobModule`, `JsonDbmlModule`, `GeminiModule`, `MulterModule`

### 7.2. Archivos Modificados

1. **`src/json-dbml/json-dbml.service.ts`**
   - Agregado `TypeMode` export
   - Modificado `mapFieldType()` para soportar `typeMode` y `originalSmartSheetType`
   - Modificado `processJsonToDbmlWithProgress()` para aceptar `typeMode` y función para obtener tipo original
   - Modificado `formatFieldNote()` para incluir fórmula de SmartSheet en `technical_desc` cuando existe

2. **`src/app.module.ts`**
   - Agregado `SmartSheetDbmlModule` a imports

---

## 8. Resumen de Patrones por Tipo SmartSheet

| SmartSheet Type | Condiciones | Airtable Type | Opciones | Notas Especiales |
|----------------|-------------|---------------|----------|------------------|
| TEXT_NUMBER | `is_computed: false` AND `column_formula: null` | `singleLineText` | - | - |
| TEXT_NUMBER | `is_computed: true` AND `select_options.length > 0` | `singleSelect` | `select_options` → `options.choices` | - |
| TEXT_NUMBER | `is_computed: true` AND `formula_return_type: "number"` | `formula` | `smartsheetFormula` | **Análisis IA en business_desc** |
| TEXT_NUMBER | `is_computed: true` AND `formula_return_type: "singleLineText"` | `formula` | `smartsheetFormula` | **Análisis IA en business_desc** |
| TEXT_NUMBER | `is_computed: true` AND `formula_return_type: null` | `formula` | `smartsheetFormula` | **Análisis IA en business_desc** |
| DATE | Siempre | `date` | - | - |
| CHECKBOX | Siempre | `checkbox` | - | - |
| PICKLIST | Siempre | `singleSelect` | `select_options` → `options.choices` (si existe) | - |
| CURRENCY | Siempre | `currency` | - | - |
| CONTACT_LIST | Siempre | `singleLineText` | - | - |
| MULTI_CONTACT_LIST | Siempre | `multipleSelects` | `select_options` → `options.choices` (si existe) | - |

### 8.1. Campos Formula - Documentación

Para todos los campos de tipo `formula`:
- **Fórmula almacenada**: `field.options.smartsheetFormula = column.column_formula`
- **Fórmula en technical_desc**: Se agrega automáticamente como `, SmartSheet Formula: [fórmula]`
- **Análisis en business_desc**: 
  - Si `useAI !== 'false'`: Se genera análisis con IA explicando qué hace la fórmula
  - Si `useAI === 'false'`: Se usa `business_desc` existente o fallback `"Calculated field: [fieldName]"`
  - Si falla IA: Fallback a `business_desc` existente o descripción por defecto

**Ejemplo de salida DBML para campo formula:**
```
Table Example {
    total_amount formula [note: 'business desc: Sums all line items to calculate total project cost, technical desc: Type: formula, SmartSheet Formula: =SUM([Line Item 1]@row, [Line Item 2]@row, [Line Item 3]@row), field ID: 1234567890']
}
```

---

## 9. Estado de Implementación

✅ **Implementación Completada**

### Características Implementadas:
- ✅ Conversión de SmartSheet JSON a formato Airtable
- ✅ Soporte para tres modos de tipo (dbml, smartsheet, airtable)
- ✅ Análisis de fórmulas con IA para business_desc
- ✅ Documentación de fórmulas en technical_desc
- ✅ Soporte para JSON body y file upload
- ✅ Procesamiento asíncrono con jobId
- ✅ Validación de tipos y corrección automática
- ✅ Documentación Swagger completa
- ✅ Manejo de errores robusto
- ✅ Integración con servicios existentes

### Archivos del Sistema:
- ✅ `src/smartsheet-dbml/smartsheet-dbml.service.ts` - Servicio de conversión
- ✅ `src/smartsheet-dbml/smartsheet-dbml.controller.ts` - Controlador con endpoint
- ✅ `src/smartsheet-dbml/smartsheet-dbml.module.ts` - Módulo NestJS
- ✅ `src/json-dbml/json-dbml.service.ts` - Modificado para soportar typeMode y fórmulas
- ✅ `src/app.module.ts` - Integrado SmartSheetDbmlModule
