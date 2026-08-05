import { XLentClient } from '@xlent/sdk';
import fs from 'fs';

export async function exportCmd(client: XLentClient, args: string[]) {
  const slug = args[0];
  if (!slug) { console.error(JSON.stringify({ error: 'Usage: xlent export <slug> [--format json] [--output file]' })); process.exit(2); }

  const entry = await client.registryEntry(slug);
  const { model } = await client.getModel(entry.id);

  const outputIdx = args.indexOf('--output');
  const output = JSON.stringify(model, null, 2);

  if (outputIdx >= 0 && args[outputIdx + 1]) {
    fs.writeFileSync(args[outputIdx + 1], output);
    console.log(JSON.stringify({ exported: args[outputIdx + 1] }));
  } else {
    console.log(output);
  }
}
