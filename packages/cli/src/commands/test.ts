import { XLentClient } from '@xlent/sdk';

export async function testCmd(client: XLentClient, args: string[]) {
  const slug = args[0];
  if (!slug) { console.error(JSON.stringify({ error: 'Usage: xlent test <slug>' })); process.exit(2); }

  // Resolve slug to model ID via registry
  const entry = await client.registryEntry(slug);
  const result = await client.runTests(entry.id, { evidence: true });

  console.log(JSON.stringify({ slug, allPass: result.allPass, count: result.count, results: result.results }));
  process.exit(result.allPass ? 0 : 1);
}
