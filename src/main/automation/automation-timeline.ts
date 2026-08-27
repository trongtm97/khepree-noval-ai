/**
 * Ordered debug timeline for one AI browser request.
 * Failures must point at the last attempted step — never a bare UNKNOWN_UI.
 */

export const AUTOMATION_TIMELINE_STEPS = [
  'SURFACE_DETECTED',
  'NOTEBOOK_VERIFIED',
  'COMPOSER_FOUND',
  'PROMPT_FILLED',
  'SEND_CLICKED',
  'SEND_CONFIRMED',
  'GENERATION_STARTED',
  'RESPONSE_CREATED',
  'RESPONSE_STABLE',
  'CAPTURED',
] as const;

export type AutomationTimelineStep = (typeof AUTOMATION_TIMELINE_STEPS)[number];

export interface AutomationTimelineEntry {
  step: AutomationTimelineStep;
  at: string;
  ok: boolean;
  detail?: Record<string, unknown>;
}

export interface AutomationTimelineSnapshot {
  correlationId: string | null;
  startedAt: string;
  finishedAt: string | null;
  entries: AutomationTimelineEntry[];
  lastOkStep: AutomationTimelineStep | null;
  failedStep: AutomationTimelineStep | null;
  failedMessage: string | null;
}

export class AutomationTimeline {
  readonly startedAt: string;
  private readonly entries: AutomationTimelineEntry[] = [];
  private finishedAt: string | null = null;
  private failedStep: AutomationTimelineStep | null = null;
  private failedMessage: string | null = null;

  constructor(private correlationId: string | null = null) {
    this.startedAt = new Date().toISOString();
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  mark(step: AutomationTimelineStep, detail?: Record<string, unknown>): void {
    this.entries.push({
      step,
      at: new Date().toISOString(),
      ok: true,
      detail: detail ? redactTimelineDetail(detail) : undefined,
    });
  }

  fail(step: AutomationTimelineStep, message: string, detail?: Record<string, unknown>): void {
    this.entries.push({
      step,
      at: new Date().toISOString(),
      ok: false,
      detail: detail ? redactTimelineDetail(detail) : undefined,
    });
    this.failedStep = step;
    this.failedMessage = message;
    this.finishedAt = new Date().toISOString();
  }

  complete(): void {
    this.finishedAt = new Date().toISOString();
  }

  lastOkStep(): AutomationTimelineStep | null {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      if (this.entries[i].ok) return this.entries[i].step;
    }
    return null;
  }

  snapshot(): AutomationTimelineSnapshot {
    return {
      correlationId: this.correlationId,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      entries: [...this.entries],
      lastOkStep: this.lastOkStep(),
      failedStep: this.failedStep,
      failedMessage: this.failedMessage,
    };
  }

  /** Human-readable: "Failed at PROMPT_FILLED (last OK: COMPOSER_FOUND)" */
  describeFailure(): string {
    if (!this.failedStep) return 'No failure recorded on timeline';
    const lastOk = this.lastOkStep();
    return lastOk
      ? `Failed at ${this.failedStep} (last OK: ${lastOk})`
      : `Failed at ${this.failedStep} (no prior OK step)`;
  }
}

const SECRET_KEY = /cookie|token|password|authorization|secret|credential|psid/i;

function redactTimelineDetail(
  detail: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_KEY.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…[truncated]`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Map a failing operation name to the nearest timeline step. */
export function timelineStepForOperation(operation: string): AutomationTimelineStep {
  const op = operation.toLowerCase();
  if (op.includes('surface') || op.includes('appshell') || op.includes('login')) {
    return 'SURFACE_DETECTED';
  }
  if (op.includes('notebook') || op.includes('thread') || op.includes('open_project')) {
    return 'NOTEBOOK_VERIFIED';
  }
  if (op.includes('promptinput') || op.includes('composer')) {
    return 'COMPOSER_FOUND';
  }
  if (op.includes('fill') || op.includes('prompt')) {
    return 'PROMPT_FILLED';
  }
  if (op.includes('sendconfirm') || op.includes('send_not')) {
    return 'SEND_CONFIRMED';
  }
  if (op.includes('send')) {
    return 'SEND_CLICKED';
  }
  if (op.includes('generationstart') || op.includes('generation_start')) {
    return 'GENERATION_STARTED';
  }
  if (op.includes('generationcomplete') || op.includes('stabil')) {
    return 'RESPONSE_STABLE';
  }
  if (op.includes('extract') || op.includes('capture') || op.includes('response')) {
    return 'RESPONSE_CREATED';
  }
  return 'SURFACE_DETECTED';
}
