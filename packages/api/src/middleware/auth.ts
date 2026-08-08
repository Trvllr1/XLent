import type { Context, Next } from 'hono';

const EXEMPT_PATHS = ['/health'];

export interface ApiPrincipal {
  id: string;
  type: 'human' | 'agent';
  roles?: string[];
}

function principalForKey(apiKey: string): ApiPrincipal | undefined {
  const configured = process.env.XLENT_API_PRINCIPALS;
  if (!configured) return undefined;
  try {
    const principals = JSON.parse(configured) as Record<string, ApiPrincipal>;
    const principal = principals[apiKey];
    if (!principal || !principal.id || !['human', 'agent'].includes(principal.type)) return undefined;
    return principal;
  } catch {
    return undefined;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  if (EXEMPT_PATHS.includes(c.req.path)) return next();

  const keys = process.env.XLENT_API_KEYS;
  if (!keys) return next(); // Auth disabled when no keys configured

  const provided = c.req.header('x-api-key');
  if (!provided) return c.json({ error: 'Missing x-api-key header' }, 401);

  const valid = keys.split(',').map((k) => k.trim());
  if (!valid.includes(provided)) return c.json({ error: 'Invalid API key' }, 401);

  const principal = principalForKey(provided);
  if (process.env.XLENT_API_PRINCIPALS && !principal) {
    return c.json({ error: 'API key has no valid principal binding' }, 403);
  }
  if (principal) c.set('xlentPrincipal', principal);

  return next();
}
