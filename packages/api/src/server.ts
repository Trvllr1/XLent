import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { modelsRouter } from './routes/models.js';

const app = new Hono();

app.use('*', cors());

app.get('/health', (c) => c.json({ status: 'ok', service: 'xlent-api', version: '0.1.0' }));

app.route('/models', modelsRouter);

const port = parseInt(process.env.PORT || '4100', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`XLent API running on http://localhost:${port}`);
});

export { app };
