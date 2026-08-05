import type { Context, Next } from 'hono';

const windowMs = 60_000;
const defaultMax = parseInt(process.env.XLENT_RATE_LIMIT || '100', 10);

interface BucketEntry { count: number; resetAt: number; }
const buckets = new Map<string, BucketEntry>();

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

export async function rateLimitMiddleware(c: Context, next: Next) {
  const key = c.req.header('x-api-key') || c.req.header('x-forwarded-for') || 'anonymous';
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;

  c.header('X-RateLimit-Limit', String(defaultMax));
  c.header('X-RateLimit-Remaining', String(Math.max(0, defaultMax - bucket.count)));
  c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > defaultMax) {
    return c.json({ error: 'Rate limit exceeded', retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }, 429);
  }

  await next();
}
