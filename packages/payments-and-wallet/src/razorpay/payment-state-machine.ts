export type PaymentState = "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

/**
 * Mirrors @stratxcel/missions' state-machine.ts pattern (a closed
 * transition table + assertTransition) so payment-state validation reads
 * the same way mission-state validation does. CAPTURED is not terminal —
 * it can move to REFUNDED/PARTIALLY_REFUNDED — but FAILED and REFUNDED are.
 */
const TERMINAL_STATES: ReadonlySet<PaymentState> = new Set(["FAILED", "REFUNDED"]);

const ALLOWED_TRANSITIONS: Record<PaymentState, ReadonlySet<PaymentState>> = {
  CREATED: new Set(["AUTHORIZED", "FAILED"]),
  AUTHORIZED: new Set(["CAPTURED", "FAILED"]),
  CAPTURED: new Set(["REFUNDED", "PARTIALLY_REFUNDED"]),
  PARTIALLY_REFUNDED: new Set(["REFUNDED", "PARTIALLY_REFUNDED"]),
  FAILED: new Set(),
  REFUNDED: new Set(),
};

export function isTerminalPaymentState(state: PaymentState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

export class InvalidPaymentTransitionError extends Error {
  readonly from: PaymentState;
  readonly to: PaymentState;
  constructor(from: PaymentState, to: PaymentState) {
    super(`Invalid payment state transition: ${from} -> ${to}`);
    this.name = "InvalidPaymentTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransitionPayment(from, to)) throw new InvalidPaymentTransitionError(from, to);
}
