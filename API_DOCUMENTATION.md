# Airtable DBML API Documentation

## Overview

Airtable DBML API is a NestJS-based REST API that converts Airtable and SmartSheet schemas to DBML (Database Markup Language) format. It provides powerful tools for data dictionary generation, schema extraction, and format conversion with AI-powered descriptions.

## Features

- **Airtable Schema Extraction**: Extract complete base schemas from Airtable API
- **DBML Generation**: Convert Airtable/SmartSheet schemas to DBML format
- **SmartSheet Support**: Convert SmartSheet data dictionaries to DBML with formula analysis
- **CSV Reports**: Generate detailed inventory and views reports in CSV format
- **DBML to CSV**: Convert DBML files back to structured CSV format
- **AI-Powered Descriptions**: Optional Gemini AI integration for business descriptions
- **Async Processing**: All heavy operations run as background jobs with status tracking

## Architecture

The API follows a modular NestJS architecture with the following modules:

- **json-dbml**: Core DBML generation from Airtable JSON schemas
- **smartsheet-dbml**: SmartSheet to DBML conversion with formula analysis
- **schema-extractor**: Direct Airtable API integration for schema extraction
- **csv-report**: Generate field inventory CSV reports
- **views-report**: Generate views summary CSV reports
- **dbml-to-csv**: Reverse conversion from DBML to CSV
- **job**: Asynchronous job management system

## API Endpoints

### 1. DBML Generation (json-dbml)

Convert Airtable schemas to DBML format.

#### `GET /json-dbml/llm-status`
Get LLM status and available business description strategies.

**Response:**
```json
{
  "llmAvailable": true,
  "geminiApiKeyConfigured": true,
  "availableStrategies": [
    {
      "value": "technical_simple",
      "label": "Technical Simple",
      "description": "Simple technical descriptions",
      "example": "Employee Name field"
    }
  ]
}
```

#### `POST /json-dbml/generate`
Generate DBML from Airtable schema JSON (synchronous).

**Request Body:**
```json
{
  "tables": [
    {
      "id": "tbl123",
      "name": "Employees",
      "primaryFieldId": "fld123",
      "fields": [
        {
          "id": "fld123",
          "type": "singleLineText",
          "name": "Employee Name",
          "description": "Employee full name"
        }
      ]
    }
  ],
  "geminiConfig": {
    "model": "gemini-1.5-flash",
    "overwriteFieldDescriptions": false,
    "businessDescriptionStrategy": "hybrid"
  }
}
```

**Query Parameters:**
- `useAirtableTypes` (boolean, default: true): Use Airtable types in DBML output

#### `POST /json-dbml/generate-async`
Generate DBML asynchronously (returns job ID).

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "statusUrl": "/jobs/uuid/status",
  "downloadUrl": "/jobs/uuid/result"
}
```

#### `POST /json-dbml/generate-from-schema-job`
Generate DBML from a previously completed schema extraction job.

**Request Body:**
```json
{
  "jobId": "schema-job-uuid"
}
```

---

### 2. SmartSheet to DBML (smartsheet-dbml)

Convert SmartSheet data dictionaries to DBML with AI formula analysis.

#### `POST /smartsheet-dbml/generate`
Convert SmartSheet JSON to DBML (async).

**Request Body:** SmartSheet JSON format

**Query Parameters:**
- `typeMode` (string, default: 'dbml'): Type output mode ('dbml' | 'smartsheet' | 'airtable')
- `useAI` (boolean, default: true): Enable AI formula analysis

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "statusUrl": "/jobs/uuid/status",
  "resultUrl": "/jobs/uuid/result"
}
```

#### `POST /smartsheet-dbml/generate-from-file`
Upload SmartSheet JSON file for conversion.

**Request:** Multipart form-data with `file` field

---

### 3. Schema Extractor (schema-extractor)

Extract schemas directly from Airtable bases.

#### `GET /schema-extractor/test-connection`
Test Airtable API connection with provided credentials.

**Query Parameters:**
- `apiToken`: Airtable Personal Access Token
- `baseId`: Airtable Base ID

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "baseInfo": {
    "baseId": "app123",
    "tablesCount": 5
  }
}
```

#### `POST /schema-extractor/extract`
Extract complete schema from Airtable base (async job).

**Request Body:**
```json
{
  "apiToken": "patXXXXXXXX",
  "baseId": "appXXXXXXXX",
  "includeViewMetadata": false
}
```

---

### 4. CSV Reports (csv-report)

Generate detailed field inventory reports.

#### `POST /csv-report/generate-from-file`
Generate CSV inventory report from Airtable schema file.

**Request:** Multipart form-data with `file` field

**Query Parameters:**
- `generateDescriptions` (boolean, default: false): Generate AI descriptions for fields

**CSV Output Columns:**
- Table Name
- Field Name
- Field Type
- Field Description
- Technical Description
- Is Read-only
- Is Formula
- Linked Table (for linked fields)

---

### 5. Views Report (views-report)

Generate CSV reports of all views in an Airtable base.

#### `POST /views-report/generate-from-file`
Generate CSV views report from schema file.

**Request:** Multipart form-data with `file` field

**CSV Output Columns:**
- Table Name
- View Name
- View Type (grid, kanban, form, calendar, gallery)

---

### 6. DBML to CSV (dbml-to-csv)

Convert DBML files back to structured CSV format.

#### `POST /dbml-to-csv/generate-from-job`
Convert DBML from a completed DBML generation job to CSV.

**Request Body:**
```json
{
  "jobId": "dbml-job-uuid"
}
```

#### `POST /dbml-to-csv/generate-from-file`
Upload DBML file and convert to CSV.

**Request:** Multipart form-data with `file` field

**CSV Output Columns:**
1. Table Name
2. Original Sheet Name
3. Path
4. Table Description
5. Field Name
6. Field Type
7. Field Description
8. Technical Description
9. Read-only

---

### 7. Job Management (jobs)

Track and download async job results.

#### `GET /jobs/{id}/status`
Get job status and progress.

**Response:**
```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 65,
  "description": "Processing table 3 of 5",
  "jobType": "dbml-generation",
  "createdAt": "2025-01-10T10:00:00Z",
  "updatedAt": "2025-01-10T10:05:00Z"
}
```

#### `GET /jobs/{id}/result`
Download job result file.

**Response:** File download (DBML, CSV, or JSON depending on job type)

---

## Common Workflows

### Workflow 1: Airtable to DBML

1. Extract schema from Airtable:
   ```
   POST /schema-extractor/extract
   { "apiToken": "patXXX", "baseId": "appXXX" }
   ```

2. Check job status:
   ```
   GET /jobs/{jobId}/status
   ```

3. Generate DBML from schema:
   ```
   POST /json-dbml/generate-from-schema-job
   { "jobId": "schema-job-id" }
   ```

4. Download DBML:
   ```
   GET /jobs/{dbml-job-id}/result
   ```

### Workflow 2: SmartSheet to CSV

1. Upload SmartSheet JSON:
   ```
   POST /smartsheet-dbml/generate-from-file
   (multipart/form-data with file)
   ```

2. Convert DBML to CSV:
   ```
   POST /dbml-to-csv/generate-from-job
   { "jobId": "smartsheet-job-id" }
   ```

3. Download CSV:
   ```
   GET /jobs/{csv-job-id}/result
   ```

### Workflow 3: Direct DBML Generation

For Airtable schemas you already have:

1. Upload JSON file:
   ```
   POST /json-dbml/generate-async
   (multipart/form-data with file)
   ```

2. Or send JSON directly:
   ```
   POST /json-dbml/generate
   { "tables": [...] }
   ```

---

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Gemini AI (optional - for AI-powered descriptions)
OPENAI_API_KEY=your_gemini_api_key

# Server
PORT=3000
```

### Job Types

The API supports these async job types:
- `schema-extraction`: Extract schema from Airtable
- `dbml-generation`: Generate DBML from JSON
- `csv-report-generation`: Generate CSV reports
- `dbml-to-csv`: Convert DBML to CSV

### Type Modes (SmartSheet)

- **dbml**: Standard DBML types (varchar, date, boolean, etc.)
- **smartsheet**: Original SmartSheet types (TEXT_NUMBER, DATE, CHECKBOX, etc.)
- **airtable**: Airtable types (singleLineText, formula, date, etc.)

---

## Data Formats

### Airtable JSON Schema Format

```json
{
  "tables": [
    {
      "id": "tbl123456",
      "name": "Employees",
      "primaryFieldId": "fld123456",
      "fields": [
        {
          "id": "fld123456",
          "type": "singleLineText",
          "name": "Employee Name",
          "description": "Full name of the employee"
        },
        {
          "id": "fld789012",
          "type": "formula",
          "name": "Total Compensation",
          "options": {
            "formula": "{Salary} + {Bonus}"
          }
        }
      ]
    }
  ]
}
```

### SmartSheet JSON Format

```json
[
  {
    "totalSheets": 10,
    "totalColumns": 150,
    "data_dictionary": [
      {
        "sheet_id": 123456789,
        "sheet_name": "Project Tracker",
        "table_name": "project_tracker",
        "columns": [
          {
            "column_id": 987654321,
            "title": "Status",
            "smartsheet_type": "PICKLIST",
            "is_computed": false,
            "select_options": ["Not Started", "In Progress", "Complete"]
          }
        ]
      }
    ]
  }
]
```

---

## Error Handling

All endpoints return standard HTTP status codes:

- `200`: Success (synchronous operations)
- `202`: Accepted (async job started)
- `400`: Bad Request (invalid input)
- `404`: Not Found (job or resource not found)
- `500`: Internal Server Error

Error responses include descriptive messages:

```json
{
  "statusCode": 400,
  "message": "Source job is not completed. Current status: processing"
}
```

---

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Running the API

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

### API Documentation (Swagger)

When running locally, visit:
```
http://localhost:3000/api
```

---

## License

MIT

## Author

willhgSA
