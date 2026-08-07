import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { modelsRouter } from './routes/models.js';
import { clientsRouter } from './routes/clients.js';
import { testsRouter } from './routes/tests.js';
import { snapshotsRouter } from './routes/snapshots.js';
import { diffRouter } from './routes/diff.js';
import { registryRouter } from './routes/registry.js';
import { sensitivityRouter } from './routes/sensitivity.js';
import { understandRouter } from './routes/understand.js';
import { findingsRouter } from './routes/findings.js';
import { contractRouter } from './routes/contract.js';
import { assuranceRouter } from './routes/assurance.js';
import { monitoringRouter } from './routes/monitoring.js';
import { v1Router } from './routes/v1/models.js';
import { authMiddleware } from './middleware/auth.js';

const app = new Hono();

app.use('*', cors());
app.use('*', authMiddleware);

app.get('/health', (c) => c.json({ status: 'ok', service: 'xlent-api', version: '0.2.0' }));

app.route('/models', modelsRouter);
app.route('/clients', clientsRouter);
app.route('/tests', testsRouter);
app.route('/snapshots', snapshotsRouter);
app.route('/diff', diffRouter);
app.route('/registry', registryRouter);
app.route('/sensitivity', sensitivityRouter);
app.route('/understand', understandRouter);
app.route('/findings', findingsRouter);
app.route('/contract', contractRouter);
app.route('/assurance', assuranceRouter);
app.route('/models', monitoringRouter);
app.route('/v1', v1Router);

const port = parseInt(process.env.PORT || '4100', 10);

// Skip listen when imported by test runner
if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`XLent API running on http://localhost:${port}`);
  });
}

export { app };
