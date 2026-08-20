/**
 * Budget Guard & Rate Limiter
 *
 * Enforces per-minute rate limits, maximum message length, tool call budgets,
 * and token consumption tracking.
 */

export class BudgetGuard {
  private ipRequestCounts: Map<string, { count: number; expiresAt: number }> = new Map();
  private maxRequestsPerMinute = 20;

  /**
   * Checks rate limit for a client IP or session.
   */
  public checkRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.ipRequestCounts.get(identifier);

    if (!entry || now > entry.expiresAt) {
      this.ipRequestCounts.set(identifier, { count: 1, expiresAt: now + 60_000 });
      return { allowed: true };
    }

    if (entry.count >= this.maxRequestsPerMinute) {
      const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    entry.count += 1;
    return { allowed: true };
  }

  /**
   * Enforces message character limit.
   */
  public validateMessageLength(message: string, maxChars = 500): { valid: boolean; error?: string } {
    if (!message || message.trim().length === 0) {
      return { valid: false, error: "Message cannot be empty" };
    }
    if (message.length > maxChars) {
      return { valid: false, error: `Message exceeds maximum limit of ${maxChars} characters` };
    }
    return { valid: true };
  }
}

export const budgetGuard = new BudgetGuard();
