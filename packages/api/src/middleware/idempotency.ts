import type { Context, Next } from 'hono';

const TTL_MS = 3600_000; // 1 hour
interface CachedResponse { status: number; body: unknown; createdAt: number; }
const cache = new Map<string, CachedResponse>();

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > TTL_MS) cache.delete(key);
  }
}, 300_000).unref();

export async function idempotencyMiddleware(c: Context, next: Next) {
  const key = c.req.header('x-idempotency-key');
  if (!key) { await next(); return; }

  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < TTL_MS) {
    c.header('X-Idempotency-Replay', 'true');
    return c.json(cached.body, cached.status as any);
  }

  await next();

  // Cache the response if it succeeded
  if (c.res.status < 500) {
    const body = await c.res.clone().json().catch(() => null);
    if (body !== null) {
      cache.set(key, { status: c.res.status, body, createdAt: Date.now() });
    }
  }
}
