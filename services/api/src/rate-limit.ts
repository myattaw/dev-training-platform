/**
 * Per-key rate limiting. Asynchronous so it can be backed by a shared store:
 * on AWS every Lambda instance has its own memory, so the DynamoDB limiter
 * (`DynamoRateLimiter`) is used there.
 */
export interface RateLimiter {
  /** Records a hit and returns how many ms to wait, or 0 if allowed. */
  hit(key: string, nowMs: number): Promise<number>;
}

/** Sliding-window rate limiter, per key, in memory. For the single-process local server. */

export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, nowMs: number): Promise<number> {
    return Promise.resolve(this.check(key, nowMs));
  }

  private check(key: string, nowMs: number): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > nowMs - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return (recent[0] ?? nowMs) + this.windowMs - nowMs;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return 0;
  }
}
