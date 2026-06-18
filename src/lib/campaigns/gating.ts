// Pure step-gating logic for the campaign engine.
// No DB / $env imports on purpose — this module is unit-testable in isolation (tsx, no Vite).
// It decides, for a step whose delay has elapsed, whether to SEND now, WAIT (park and re-check),
// or SKIP (advance past it without sending).

/** How often a parked "wait" step is re-evaluated while it waits for its condition to flip. */
export const WAIT_RECHECK_MS = 30 * 60 * 1000; // 30 minutes

export type StepGateAction =
  | { action: 'send' }
  | { action: 'wait'; until: Date }
  | { action: 'skip'; reason: string };

export interface GateStep {
  condition: string; // always | if-no-reply | if-no-open | if-opened | if-clicked
  waitForCondition: boolean; // when true + condition unmet → wait instead of skip
  waitTimeoutHours: number; // max time to wait before the fallback fires
  onTimeout: string; // 'skip' | 'send'
}

export interface GateEnrollment {
  openedAt: Date | null;
  clickedAt: Date | null;
  waitingSince: Date | null;
}

/**
 * Is a step's condition currently satisfied for this enrollment?
 * Replied/bounced enrollments are already non-active and never reach here, so if-no-reply
 * behaves as "always" — the sequence only keeps running while the enrollment is still active.
 */
export function meetsCondition(
  condition: string,
  enr: { openedAt: Date | null; clickedAt: Date | null }
): boolean {
  switch (condition) {
    case 'if-opened':
      return enr.openedAt != null;
    case 'if-clicked':
      return enr.clickedAt != null;
    case 'if-no-open':
      return enr.openedAt == null;
    case 'if-no-reply':
    case 'always':
    default:
      return true;
  }
}

/** Only engagement-gated conditions can meaningfully be *waited on* (an open/click may yet happen). */
export function isWaitable(condition: string): boolean {
  return condition === 'if-opened' || condition === 'if-clicked';
}

/**
 * Decide what to do with a step whose delay has elapsed:
 *  - condition met               → send
 *  - condition unmet, not a wait → skip (legacy skip-and-advance)
 *  - condition unmet, wait step  → wait until met or the timeout elapses;
 *                                  on timeout, send anyway or skip per `onTimeout`.
 */
export function evaluateStepGate(step: GateStep, enr: GateEnrollment, now: Date): StepGateAction {
  if (meetsCondition(step.condition, enr)) return { action: 'send' };

  // Condition not met. Without an explicit wait, fall back to the original skip-and-advance.
  if (!step.waitForCondition || !isWaitable(step.condition)) {
    return { action: 'skip', reason: `${step.condition} not met` };
  }

  // Wait step: hold the enrollment here until the condition flips or the window closes.
  const since = enr.waitingSince ?? now; // first time we hit this gate → start the clock now
  const deadline = since.getTime() + Math.max(0, step.waitTimeoutHours) * 3_600_000;
  if (now.getTime() >= deadline) {
    return step.onTimeout === 'send'
      ? { action: 'send' } // give up waiting and send anyway
      : { action: 'skip', reason: `${step.condition} timed out after ${step.waitTimeoutHours}h` };
  }
  // Still inside the window → re-check later, but never past the deadline.
  const until = new Date(Math.min(now.getTime() + WAIT_RECHECK_MS, deadline));
  return { action: 'wait', until };
}
