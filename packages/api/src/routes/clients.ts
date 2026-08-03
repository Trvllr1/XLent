import { Hono } from 'hono';
import { z } from 'zod';
import { clientStore } from '../store.js';

const createClientSchema = z.object({
  name: z.string().min(1).max(100),
  webhookUrl: z.string().url(),
});

export const clientsRouter = new Hono();

/** POST /clients — Register a new client */
clientsRouter.post('/', async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const client = clientStore.createClient(parsed.data.name, parsed.data.webhookUrl);
  // Return the API key only on creation — it won't be shown again in list responses
  return c.json({ client }, 201);
});

/** GET /clients — List registered clients (keys redacted) */
clientsRouter.get('/', (c) => {
  const clients = clientStore.listClients().map(({ apiKey, ...rest }) => ({
    ...rest,
    apiKeyPrefix: apiKey.slice(0, 8) + '…',
  }));
  return c.json({ clients });
});

/** DELETE /clients/:id — Unregister a client */
clientsRouter.delete('/:id', (c) => {
  const deleted = clientStore.deleteClient(c.req.param('id'));
  if (!deleted) return c.json({ error: 'Client not found' }, 404);
  return c.json({ deleted: true });
});
