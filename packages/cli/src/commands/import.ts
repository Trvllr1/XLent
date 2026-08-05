import { XLentClient } from '@xlent/sdk';
import fs from 'fs';
import path from 'path';

export async function importCmd(client: XLentClient, args: string[]) {
  const filePath = args[0];
  if (!filePath) { console.error(JSON.stringify({ error: 'Usage: xlent import <file>' })); process.exit(2); }

  const buffer = fs.readFileSync(path.resolve(filePath));
  const filename = path.basename(filePath);
  const result = await client.importWorkbook(buffer.buffer as ArrayBuffer, filename);
  console.log(JSON.stringify({ model: { id: result.model.id, slug: result.model.slug, semver: result.model.semver, name: result.model.name } }));
}
