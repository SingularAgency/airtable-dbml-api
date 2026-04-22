import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { getActionTypeLabel, getTriggerTypeLabel } from './workflow-type-labels';
import { GeminiService } from '../gemini/gemini.service';

/** Minimal shape of Airtable automations metadata response */
interface WorkflowActionNode {
  id: string;
  workflowActionTypeId: string;
  nextWorkflowActionId: string | null;
  /**
   * If Airtable ever exposes per-step titles in this endpoint, we surface them here.
   * Today the API usually omits this; the UI step name is not always available via API.
   */
  customStepName?: string;
}

interface WorkflowGraph {
  id: string;
  /** May be null/omitted or point outside actionsById on some Airtable payloads. */
  entryWorkflowActionId: string | null;
  actionsById: Record<string, WorkflowActionNode | unknown>;
}

interface WorkflowTrigger {
  id: string;
  workflowTriggerTypeId: string;
}

interface AutomationWorkflow {
  id: string;
  applicationId: string;
  name: string;
  description: string | null;
  version: number;
  liveWorkflowDeploymentVersion: number | null;
  targetWorkflowDeploymentId: string | null;
  deploymentStatus: string;
  deploymentError: string | null;
  trigger: WorkflowTrigger;
  graph: WorkflowGraph;
}

@Injectable()
export class AutomationsDocsService {
  private readonly logger = new Logger(AutomationsDocsService.name);

  constructor(private readonly geminiService: GeminiService) {}

  async exportAutomationsMarkdown(
    baseId: string,
    accessToken: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    if (!accessToken.startsWith('pat')) {
      throw new Error(
        'Invalid Personal Access Token format. Token must start with "pat"',
      );
    }
    if (!baseId.startsWith('app')) {
      throw new Error('Invalid Base ID format. Base ID must start with "app"');
    }

    const url = `https://api.airtable.com/v0/meta/bases/${baseId}/automations`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    updateProgress(15, 'Fetching automations from Airtable');

    try {
      const response = await axios.get(url, {
        headers,
        timeout: 90000,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 200) {
        const workflows = response.data?.workflows;
        if (!Array.isArray(workflows)) {
          return this.buildUnexpectedShapeMarkdown(baseId, url, response.data);
        }
        const workflowList = workflows as AutomationWorkflow[];
        const { actionTypeIds, triggerTypeIds } =
          this.collectAutomationTypeIds(workflowList);

        let llmActionLabels: Record<string, string> = {};
        let llmTriggerLabels: Record<string, string> = {};
        if (actionTypeIds.length + triggerTypeIds.length > 0) {
          updateProgress(
            40,
            'Resolving all action and trigger type names with OpenAI (throttled, batched like DBML)…',
          );
          try {
            const batch = await this.geminiService.inferAirtableAutomationLabelsBatched(
              actionTypeIds,
              triggerTypeIds,
            );
            llmActionLabels = batch.actions;
            llmTriggerLabels = batch.triggers;
          } catch (llmError: any) {
            this.logger.warn(
              `OpenAI label batch failed, using heuristics only: ${llmError?.message}`,
            );
          }
        }

        updateProgress(80, 'Building Markdown documentation');
        const md = this.buildSuccessMarkdown(
          baseId,
          url,
          workflowList,
          llmActionLabels,
          llmTriggerLabels,
        );
        updateProgress(100, 'Automations documentation generated');
        return md;
      }

      if (response.status === 401 || response.status === 403) {
        updateProgress(100, 'Access denied; writing explanation to Markdown');
        return this.buildAccessDeniedMarkdown(
          baseId,
          url,
          response.status,
          response.data,
        );
      }

      updateProgress(100, `Airtable returned HTTP ${response.status}`);
      return this.buildErrorMarkdown(
        baseId,
        url,
        response.status,
        response.data,
        'Unexpected HTTP status from Airtable automations endpoint.',
      );
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response) {
        const status = ax.response.status;
        const data = ax.response.data;
        if (status === 401 || status === 403) {
          return this.buildAccessDeniedMarkdown(baseId, url, status, data);
        }
        this.logger.error(
          `Airtable automations request failed: ${status}`,
          ax.message,
        );
        return this.buildErrorMarkdown(
          baseId,
          url,
          status,
          data,
          ax.message || 'Request failed',
        );
      }
      this.logger.error(`Automations export failed: ${err?.message}`, ax?.stack);
      throw err;
    }
  }

  private collectAutomationTypeIds(workflows: AutomationWorkflow[]): {
    actionTypeIds: string[];
    triggerTypeIds: string[];
  } {
    const actionSet = new Set<string>();
    const triggerSet = new Set<string>();
    for (const wf of workflows) {
      const tid = wf?.trigger?.workflowTriggerTypeId;
      if (typeof tid === 'string' && tid.length > 0) {
        triggerSet.add(tid);
      }
      const graph = wf?.graph;
      if (!graph?.actionsById) {
        continue;
      }
      for (const key of Object.keys(graph.actionsById)) {
        const raw = graph.actionsById[key] as Record<string, unknown> | undefined;
        const actionTypeId = raw?.workflowActionTypeId;
        if (typeof actionTypeId === 'string' && actionTypeId.length > 0) {
          actionSet.add(actionTypeId);
        }
      }
    }
    return {
      actionTypeIds: [...actionSet],
      triggerTypeIds: [...triggerSet],
    };
  }

  private buildSuccessMarkdown(
    _baseId: string,
    _sourceUrl: string,
    workflows: AutomationWorkflow[],
    llmActionLabels: Record<string, string>,
    llmTriggerLabels: Record<string, string>,
  ): string {
    const lines: string[] = [];
    const generatedAt = new Date().toISOString();
    const when = this.formatDateReadable(generatedAt);
    const countLabel =
      workflows.length === 1 ? '1 automation' : `${workflows.length} automations`;

    lines.push('# Automations overview');
    lines.push('');
    lines.push(
      `*Last updated: ${this.escapeCell(when)} — ${this.escapeCell(countLabel)} in this base.*`,
    );
    lines.push('');

    if (workflows.length === 0) {
      lines.push('No automations are documented for this base yet.');
      lines.push('');
      lines.push(...this.executiveFooterNote());
      return lines.join('\n');
    }

    workflows.forEach((wf) => {
      lines.push(`## ${this.escapeHeadingText(wf.name || 'Untitled automation')}`);
      lines.push('');

      const statusLine = this.friendlyDeploymentStatus(wf.deploymentStatus);
      lines.push(`- **Status:** ${this.escapeCell(statusLine)}`);
      if (wf.deploymentError) {
        lines.push(
          `- **Note:** ${this.escapeCell(String(wf.deploymentError))}`,
        );
      }

      const whenRuns = this.resolveTriggerLabel(
        wf.trigger.workflowTriggerTypeId,
        llmTriggerLabels,
      );
      lines.push(`- **When it runs:** ${this.escapeCell(whenRuns)}`);
      lines.push('');

      if (wf.description && String(wf.description).trim().length > 0) {
        lines.push(
          `> ${this.escapeCell(String(wf.description).trim())}`,
        );
        lines.push('');
      }

      const ordered = this.orderActions(wf.graph);
      if (ordered.length === 0) {
        lines.push('**Steps:** (none listed)');
        lines.push('');
        lines.push('---');
        lines.push('');
        return;
      }

      lines.push('**What it does (in order):**');
      lines.push('');
      ordered.forEach((action, i) => {
        const label = this.resolveActionLabel(
          action.workflowActionTypeId,
          llmActionLabels,
        );
        if (action.customStepName && action.customStepName.trim().length > 0) {
          lines.push(
            `${i + 1}. ${this.escapeCell(label)} *(${this.escapeCell(action.customStepName.trim())})*`,
          );
        } else {
          lines.push(`${i + 1}. ${this.escapeCell(label)}`);
        }
      });
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    lines.push(...this.executiveFooterNote());
    return lines.join('\n');
  }

  private formatDateReadable(iso: string): string {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        return iso;
      }
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  private friendlyDeploymentStatus(status: string | undefined): string {
    if (!status) {
      return 'Unknown';
    }
    const s = status.toLowerCase();
    if (s === 'deployed') {
      return 'Active';
    }
    if (s === 'undeployed') {
      return 'Not active (draft)';
    }
    return status;
  }

  /** Short closing note for business readers; avoids API / token jargon. */
  private executiveFooterNote(): string[] {
    return [
      '*This is an auto-generated summary. For exact conditions, field mappings, and step settings, open the automation in Airtable.*',
      '',
    ];
  }

  private resolveActionLabel(
    workflowActionTypeId: string,
    llm: Record<string, string>,
  ): string {
    const fromLlm = llm[workflowActionTypeId];
    if (typeof fromLlm === 'string' && fromLlm.trim().length > 0) {
      return fromLlm.trim();
    }
    return getActionTypeLabel(workflowActionTypeId);
  }

  private resolveTriggerLabel(
    workflowTriggerTypeId: string,
    llm: Record<string, string>,
  ): string {
    const fromLlm = llm[workflowTriggerTypeId];
    if (typeof fromLlm === 'string' && fromLlm.trim().length > 0) {
      return fromLlm.trim();
    }
    return getTriggerTypeLabel(workflowTriggerTypeId);
  }

  /**
   * Walks the main path from the entry (or a guessed root), then appends any action
   * nodes that were not reachable via nextWorkflowActionId (common for branches, groups,
   * or when the API’s entry id does not match a key in actionsById).
   */
  private orderActions(graph: WorkflowGraph): WorkflowActionNode[] {
    if (!graph?.actionsById) {
      return [];
    }
    const byId = graph.actionsById as Record<string, unknown>;
    const allKeys = Object.keys(byId);
    if (allKeys.length === 0) {
      return [];
    }

    const entry = this.resolveEntryActionId(
      graph.entryWorkflowActionId,
      byId,
    );
    const ordered: WorkflowActionNode[] = [];
    const visited = new Set<string>();
    let current: string | null = entry;

    while (current && !visited.has(current) && byId[current] !== undefined) {
      visited.add(current);
      const node = this.normalizeActionNode(byId[current]);
      ordered.push(node);
      const next = node.nextWorkflowActionId;
      current = next && byId[next] !== undefined ? next : null;
    }

    const unvisited = allKeys
      .filter((id) => !visited.has(id))
      .sort();
    for (const id of unvisited) {
      ordered.push(this.normalizeActionNode(byId[id]));
    }

    return ordered;
  }

  /**
   * Picks a starting node. Prefer API entry when it exists in actionsById; otherwise
   * choose a node that no other node points to as next (a root), or the first id
   * lexicographically.
   */
  private resolveEntryActionId(
    entry: string | null | undefined,
    byId: Record<string, unknown>,
  ): string | null {
    if (typeof entry === 'string' && entry && byId[entry] !== undefined) {
      return entry;
    }
    const allIds = Object.keys(byId);
    const pointedTo = new Set<string>();
    for (const id of allIds) {
      const n = this.extractNextIdFromRaw(byId[id]);
      if (n && byId[n] !== undefined) {
        pointedTo.add(n);
      }
    }
    const roots = allIds.filter((id) => !pointedTo.has(id));
    if (roots.length > 0) {
      return roots.sort()[0] ?? null;
    }
    return allIds.sort()[0] ?? null;
  }

  private extractNextIdFromRaw(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const r = raw as Record<string, unknown>;
    const a = r.nextWorkflowActionId;
    if (typeof a === 'string' && a.length > 0) {
      return a;
    }
    const b = (r as { nextWorkflowActionID?: string }).nextWorkflowActionID;
    if (typeof b === 'string' && b.length > 0) {
      return b;
    }
    return null;
  }

  /**
   * Map Airtable action object to a normalized shape. Pass through optional name/title/label
   * if the API ever includes them.
   */
  private normalizeActionNode(raw: unknown): WorkflowActionNode {
    const r = raw as Record<string, unknown>;
    const customName =
      typeof r.name === 'string'
        ? r.name
        : typeof r.title === 'string'
          ? r.title
          : typeof r.label === 'string'
            ? (r.label as string)
            : undefined;
    const next = this.extractNextIdFromRaw(raw);
    return {
      id: String(r.id ?? ''),
      workflowActionTypeId: String(r.workflowActionTypeId ?? ''),
      nextWorkflowActionId: next,
      customStepName: customName,
    };
  }

  /** Short troubleshooting block for error-style exports (not used in the success “executive” doc). */
  private accessTroubleshootingNote(): string[] {
    return [
      '',
      '**If you are setting this up for the first time:** confirm your access token can read automations for this base, and that the base is included in the token’s allowed resources.',
      '',
    ];
  }

  private buildAccessDeniedMarkdown(
    baseId: string,
    sourceUrl: string,
    status: number,
    body: unknown,
  ): string {
    const lines: string[] = [];
    lines.push('# Automations export');
    lines.push('');
    lines.push('## Access was blocked');
    lines.push('');
    lines.push(
      'We could not read your automations from Airtable (the connection was not allowed for this base or token).',
    );
    lines.push('');
    lines.push('**Check:** your token can use the automations scope, this base is allowed for the token, and your user can open **Automations** in Airtable for this base.');
    lines.push(...this.accessTroubleshootingNote());
    const detail = this.safeJsonStringify(body);
    if (detail && detail !== 'null' && detail.trim().length > 0) {
      lines.push('**Details (for support):**');
      lines.push('');
      lines.push('```');
      lines.push(
        `HTTP ${status} · ${this.escapeCell(sourceUrl)} · base ${this.escapeCell(baseId)}`,
      );
      lines.push(detail);
      lines.push('```');
      lines.push('');
    }
    return lines.join('\n');
  }

  private buildErrorMarkdown(
    baseId: string,
    sourceUrl: string,
    status: number,
    body: unknown,
    message: string,
  ): string {
    const lines: string[] = [];
    lines.push('# Automations export');
    lines.push('');
    lines.push('## Something went wrong');
    lines.push('');
    lines.push(this.escapeCell(message));
    lines.push('');
    lines.push('```');
    lines.push(
      `HTTP ${status} · ${this.escapeCell(sourceUrl)} · base ${this.escapeCell(baseId)}`,
    );
    lines.push(this.safeJsonStringify(body));
    lines.push('```');
    lines.push('');
    return lines.join('\n');
  }

  private buildUnexpectedShapeMarkdown(
    baseId: string,
    sourceUrl: string,
    body: unknown,
  ): string {
    const lines: string[] = [];
    lines.push('# Automations export');
    lines.push('');
    lines.push('## Unexpected data from Airtable');
    lines.push('');
    lines.push(
      'We got a response, but it was not in the expected format (no list of automations).',
    );
    lines.push('');
    lines.push('```');
    lines.push(
      `${this.escapeCell(sourceUrl)} · base ${this.escapeCell(baseId)}`,
    );
    lines.push(this.safeJsonStringify(body));
    lines.push('```');
    lines.push('');
    return lines.join('\n');
  }

  private safeJsonStringify(data: unknown): string {
    try {
      return JSON.stringify(data ?? null, null, 2);
    } catch {
      return String(data);
    }
  }

  private escapeCell(text: string): string {
    return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  }

  private escapeHeadingText(text: string): string {
    return String(text).replace(/#/g, '\\#').trim() || 'Untitled';
  }
}
