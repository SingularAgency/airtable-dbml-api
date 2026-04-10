# Airtable DBML API

A powerful NestJS REST API that converts Airtable and SmartSheet schemas to DBML (Database Markup Language) format, with support for AI-powered descriptions and comprehensive reporting.

## Features

- **Airtable Schema Extraction**: Extract complete base schemas from Airtable API
- **DBML Generation**: Convert Airtable/SmartSheet schemas to DBML format
- **SmartSheet Support**: Convert SmartSheet data dictionaries to DBML with AI formula analysis
- **CSV Reports**: Generate detailed inventory and views reports
- **DBML to CSV**: Convert DBML files back to structured CSV format
- **AI-Powered Descriptions**: Optional Gemini AI integration for intelligent field descriptions
- **Async Processing**: Background job processing with status tracking

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Documentation

- **[API Documentation](API_DOCUMENTATION.md)** - Complete endpoint reference with examples
- **[SmartSheet Implementation](SMARTSHEET_TO_DBML_ANALYSIS_AND_PROMPT.md)** - Technical implementation details for SmartSheet conversion

## API Modules

| Module | Description |
|--------|-------------|
| `json-dbml` | Core DBML generation from Airtable schemas |
| `smartsheet-dbml` | SmartSheet data dictionary to DBML conversion |
| `schema-extractor` | Direct Airtable API integration |
| `csv-report` | Field inventory CSV reports |
| `views-report` | Views summary CSV reports |
| `dbml-to-csv` | DBML to CSV conversion |
| `jobs` | Async job management |

## Environment Variables

Create a `.env` file:

```env
# Optional: Google Gemini API key for AI-powered descriptions
OPENAI_API_KEY=your_gemini_api_key_here

# Server port (default: 3000)
PORT=3000
```

## API Documentation (Swagger)

When running locally:
```
http://localhost:3000/api
```

## License

MIT

## Author

willhgSA
