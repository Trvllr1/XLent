/**
 * Register Siliconomics as a client in XLent and push all Sil-focused models.
 * Run: node fixtures/push-to-sil.mjs
 */
const XLENT = 'http://localhost:4100';
const SIL_WEBHOOK = 'http://localhost:3000/api/xlent-webhook';

const SIL_SLUGS = [
  'wafer-economics',
  'node-transition-3nm',
  'foundry-capacity-plan',
  'chip-shortage-impact',
  'yield-ramp-model',
  'packaging-cost-comparison',
];

// 1. Register Siliconomics as a client
console.log('Registering Siliconomics as XLent client...');
const clientRes = await fetch(`${XLENT}/clients`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Siliconomics', webhookUrl: SIL_WEBHOOK }),
});
const { client } = await clientRes.json();
console.log(`  Client ID: ${client.id}`);
console.log(`  API Key:   ${client.apiKey}\n`);

// 2. Get all models
const modelsRes = await fetch(`${XLENT}/models`);
const { models } = await modelsRes.json();

// 3. Push each Sil-focused model
console.log('Pushing Sil-focused models...\n');
for (const slug of SIL_SLUGS) {
  const model = models.find(m => m.slug === slug);
  if (!model) {
    console.log(`  ✗ ${slug} — not found in API`);
    continue;
  }

  const deliverRes = await fetch(`${XLENT}/models/${model.id}/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: client.id }),
  });

  if (deliverRes.ok) {
    const data = await deliverRes.json();
    console.log(`  ✓ ${slug} → pushed (delivery ${data.delivery.id.slice(0, 8)}…)`);
  } else {
    const err = await deliverRes.text();
    console.log(`  ✗ ${slug} — ${deliverRes.status}: ${err.slice(0, 100)}`);
  }
}

// 4. Verify Sil inbox
console.log('\nVerifying Sil inbox...');
const inboxRes = await fetch('http://localhost:3000/api/xlent-inbox');
const inbox = await inboxRes.json();
console.log(`  ${inbox.length} item(s) in inbox`);
for (const item of inbox) {
  console.log(`    • ${item.deliverable.modelName} (${item.status})`);
}
