import type { Context, Next } from 'hono';

const EXEMPT_PATHS = ['/health'];

export async function authMiddleware(c: Context, next: Next) {
  if (EXEMPT_PATHS.includes(c.req.path)) return next();

  const keys = process.env.XLENT_API_KEYS;
  if (!keys) return next(); // Auth disabled when no keys configured

  const provided = c.req.header('x-api-key');
  if (!provided) return c.json({ error: 'Missing x-api-key header' }, 401);

  const valid = keys.split(',').map((k) => k.trim());
  if (!valid.includes(provided)) return c.json({ error: 'Invalid API key' }, 401);

  return next();
}
