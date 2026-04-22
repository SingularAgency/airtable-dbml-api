/**
 * Airtable's automations metadata API returns internal workflowActionTypeId / workflowTriggerTypeId
 * values. It does not return the same human-readable step titles you see in the automations UI.
 * We map known IDs and use substring heuristics to produce readable labels when possible.
 */

const TRIGGER_EXACT: Record<string, string> = {
  wttRECORDCREATED0: 'When a record is created',
  wttRECORDMATCHES0: 'When a record matches conditions',
  wttFORMULACHANGED0: 'When a field is updated (or similar field trigger)',
  wttSCHEDULED00000: 'At a scheduled time',
  wttBRZzRXx3C2jyIc: 'Custom / button or interface trigger (internal id)',
};

const ACTION_EXACT: Record<string, string> = {
  watCUSTOMSCRIPT00: 'Run a script',
  watAIGENERATE0000: 'AI: Generate (Omni / AI action)',
  watOUTLOKCREATEVT: 'Outlook: Create event',
  watOUTLOKUPDATEVT: 'Outlook: Update event',
};

type HeuristicRule = { test: (id: string) => boolean; label: string };

const ACTION_HEURISTICS: HeuristicRule[] = [
  { test: (id) => /CUSTOMSCRIPT/i.test(id), label: 'Run a script' },
  { test: (id) => /AIGENERATE|watAI|OMNI/i.test(id), label: 'AI: Generate' },
  { test: (id) => /OUTLOK|OUTLOOK|MSFT.*CAL/i.test(id), label: 'Microsoft Outlook' },
  { test: (id) => /GMAIL|GOOGLE.*MAIL/i.test(id), label: 'Gmail' },
  { test: (id) => /SLACK/i.test(id), label: 'Slack' },
  { test: (id) => /WEBHOOK|HTTP.*REQUEST|HTTPREQUEST/i.test(id), label: 'Send webhook / HTTP request' },
  { test: (id) => /SEND.*MAIL|EMAIL|OUTBOUNDEMAIL/i.test(id), label: 'Send email' },
  { test: (id) => /UPDATERECORD|UPDATE.*RECORD/i.test(id), label: 'Update record' },
  { test: (id) => /CREATERECORD|CREATE.*RECORD/i.test(id), label: 'Create record' },
  { test: (id) => /FINDRECORDS|FIND.*RECORD/i.test(id), label: 'Find records' },
  { test: (id) => /DELAY|WAIT|PAUSE/i.test(id), label: 'Delay' },
  { test: (id) => /CONDITION|BRANCH|IF|SWITCH/i.test(id), label: 'Conditional / branch' },
  { test: (id) => /^watBET/i.test(id), label: 'App integration (partner / marketplace block, inferred)' },
];

const TRIGGER_HEURISTICS: HeuristicRule[] = [
  { test: (id) => /RECORDCREATED/i.test(id), label: 'When a record is created' },
  { test: (id) => /RECORDMATCHES|RECORD.*MATCH/i.test(id), label: 'When a record matches conditions' },
  { test: (id) => /SCHEDULED|SCHED|CRON/i.test(id), label: 'Scheduled trigger' },
  { test: (id) => /wtt.*FORM|FORM.*SUBMIT|SUBMIT.*FORM/i.test(id), label: 'Form submission trigger' },
  { test: (id) => /WEBHOOK/i.test(id), label: 'Incoming webhook' },
  { test: (id) => /BUTTON|CLICK|MANUAL/i.test(id), label: 'Button or manual trigger' },
];

/**
 * Human-readable label for a workflow trigger type id, or a fallback message.
 */
export function getTriggerTypeLabel(workflowTriggerTypeId: string): string {
  const id = workflowTriggerTypeId?.trim() || '';
  if (!id) {
    return 'Unknown trigger';
  }
  if (TRIGGER_EXACT[id]) {
    return TRIGGER_EXACT[id];
  }
  for (const rule of TRIGGER_HEURISTICS) {
    if (rule.test(id)) {
      return `${rule.label} (inferred from id)`;
    }
  }
  return `Unknown trigger type (API only exposes internal id: ${id})`;
}

/**
 * Human-readable label for a workflow action type id, or a fallback message.
 */
export function getActionTypeLabel(workflowActionTypeId: string): string {
  const id = workflowActionTypeId?.trim() || '';
  if (!id) {
    return 'Unknown action';
  }
  if (ACTION_EXACT[id]) {
    return ACTION_EXACT[id];
  }
  for (const rule of ACTION_HEURISTICS) {
    if (rule.test(id)) {
      return `${rule.label} (inferred from id)`;
    }
  }
  return `Unknown / app-specific action (API only exposes internal type id: ${id})`;
}
