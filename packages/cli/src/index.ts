#!/usr/bin/env node
import { XLentClient } from '@xlent/sdk';
import { importCmd } from './commands/import.js';
import { runCmd } from './commands/run.js';
import { testCmd } from './commands/test.js';
import { diffCmd } from './commands/diff.js';
import { exportCmd } from './commands/export.js';
import { packageCmd } from './commands/package.js';

const API_URL = process.env.XLENT_API_URL || 'http://localhost:4100';
const API_KEY = process.env.XLENT_API_KEY || '';

function createClient(args: string[]): XLentClient {
  const urlIdx = args.indexOf('--api-url');
  const keyIdx = args.indexOf('--api-key');
  const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : API_URL;
  const apiKey = keyIdx >= 0 ? args[keyIdx + 1] : API_KEY;
  return new XLentClient({ baseUrl, apiKey });
}

function stripFlags(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-url' || args[i] === '--api-key') { i++; continue; }
    result.push(args[i]);
  }
  return result;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const client = createClient(rawArgs);
  const args = stripFlags(rawArgs);
  const command = args[0];

  try {
    switch (command) {
      case 'import': await importCmd(client, args.slice(1)); break;
      case 'run': await runCmd(client, args.slice(1)); break;
      case 'test': await testCmd(client, args.slice(1)); break;
      case 'diff': await diffCmd(client, args.slice(1)); break;
      case 'export': await exportCmd(client, args.slice(1)); break;
      case 'package': await packageCmd(client, args.slice(1)); break;
      default:
        console.error('Usage: xlent <command> [options]\n\nCommands: import, run, test, diff, export, package');
        process.exit(2);
    }
  } catch (err: any) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(2);
  }
}

main();
