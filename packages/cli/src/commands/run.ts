import { XLentClient } from '@xlent/sdk';

export async function runCmd(client: XLentClient, args: string[]) {
  const slug = args[0];
  if (!slug) { console.error(JSON.stringify({ error: 'Usage: xlent run <slug> [--override key=val ...]' })); process.exit(2); }

  const overrides: { parameterId: string; value: unknown }[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--override' && args[i + 1]) {
      const [key, val] = args[++i].split('=');
      overrides.push({ parameterId: key, value: isNaN(Number(val)) ? val : Number(val) });
    }
  }

  const result = await client.execute(slug, overrides.length > 0 ? overrides : undefined);
  console.log(JSON.stringify(result));
}
