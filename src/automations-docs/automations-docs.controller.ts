import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AutomationsDocsService } from './automations-docs.service';
import { ExportAutomationsDocsDto } from './dto/export-automations-docs.dto';
import { JobService } from '../job/job.service';

@ApiTags('automations-docs')
@Controller('automations-docs')
export class AutomationsDocsController {
  constructor(
    private readonly automationsDocsService: AutomationsDocsService,
    private readonly jobService: JobService,
  ) {}

  @Post('export')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Export Airtable automations metadata to Markdown (async job)',
    description: `Starts a background job that reads your base automations and writes a **short, reader-friendly Markdown** summary: automation name, status in plain language, when it runs, and numbered steps (labels via **OpenAI** / \`OPENAI_API_KEY\`, with the same **throttled** requests as DBML generation).

**Requirements**
- Personal Access Token (PAT) with **automations:read** and this base allowed on the token

**Result**
- Poll \`GET /jobs/{jobId}/status\` until \`completed\`, then download \`GET /jobs/{jobId}/result\` (Markdown).

If Airtable returns **401/403**, the job still completes with a brief explanation instead of the overview.`,
  })
  @ApiBody({ type: ExportAutomationsDocsDto })
  @ApiResponse({
    status: 202,
    description: 'Job accepted; Markdown will be available at result URL when completed',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string', example: 'pending' },
        message: { type: 'string' },
        statusUrl: { type: 'string' },
        resultUrl: { type: 'string' },
      },
    },
  })
  async export(@Body() dto: ExportAutomationsDocsDto) {
    const jobId = this.jobService.createJob('automations-docs-export');

    setTimeout(() => {
      this.jobService.processAsyncJob(jobId, async (updateProgress) => {
        return await this.automationsDocsService.exportAutomationsMarkdown(
          dto.baseId,
          dto.accessToken,
          updateProgress,
        );
      });
    }, 0);

    return {
      jobId,
      status: 'pending',
      message:
        'Automations documentation export started. Download the .md from the result URL when the job completes.',
      statusUrl: `/jobs/${jobId}/status`,
      resultUrl: `/jobs/${jobId}/result`,
    };
  }
}
