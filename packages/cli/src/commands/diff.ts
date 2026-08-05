import { XLentClient } from '@xlent/sdk';

export async function diffCmd(client: XLentClient, args: string[]) {
  const slug = args[0];
  if (!slug) { console.error(JSON.stringify({ error: 'Usage: xlent diff <slug> --from <v1> --to <v2>' })); process.exit(2); }

  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  if (fromIdx < 0 || toIdx < 0) { console.error(JSON.stringify({ error: '--from and --to flags required' })); process.exit(2); }

  const from = args[fromIdx + 1];
  const to = args[toIdx + 1];

  const entry = await client.registryEntry(slug);
  const result = await client.diff(entry.id, from, to);
  console.log(JSON.stringify(result));
}
